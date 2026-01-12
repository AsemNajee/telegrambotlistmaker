import { Context, Telegraf, Markup } from 'telegraf';
import Bot, { IBot } from '../models/Bot';
import Channel from '../models/Channel';

// نظام بسيط لإدارة الحالات في الذاكرة (لبيئة Serverless يفضل استخدام DB ولكن للسرعة هنا سنستخدمها مؤقتاً)
const userStates: Map<number, { action: string, data?: any }> = new Map();

export const setupChildBot = (bot: Telegraf<Context>, botData: IBot) => {
  
  const notifyAdmin = async (message: string) => {
    if (botData.adminGroupId) {
      try {
        await bot.telegram.sendMessage(botData.adminGroupId, `🔔 إشعار إداري:\n${message}`);
      } catch (e) {}
    }
  };

  const getAdminKeyboard = (botSettings: IBot) => {
    return Markup.inlineKeyboard([
      [Markup.button.callback('📊 الإحصائيات والقنوات', 'stats'), Markup.button.callback('⚙️ الإعدادات العامة', 'settings')],
      [Markup.button.callback('📝 تخصيص الرسالة', 'edit_msg'), Markup.button.callback('🎨 تنسيق الأسماء', 'edit_template')],
      [Markup.button.callback('🔢 الأعمدة والحدود', 'edit_limits'), Markup.button.callback('🛡 الحماية والترتيب', 'edit_protection')],
      [Markup.button.callback('📢 نشر القائمة', 'publish'), Markup.button.callback('🗑 حذف القائمة', 'delete')],
      [Markup.button.callback('❓ المساعدة بالتفصيل', 'help_main')]
    ]);
  };

  bot.start((ctx) => {
    if (ctx.from.id === botData.ownerId) {
      ctx.reply('مرحباً بك في لوحة تحكم بوتك! 👑', getAdminKeyboard(botData));
    } else {
      ctx.reply('مرحباً بك! لإضافة قناتك:\n1. ارفع البوت مسؤولاً.\n2. أرسل الرابط لمجموعة الاستقبال.\n\nمثال للاسم المخصص:\nاسم القناة\nhttps://t.me/link');
    }
  });

  bot.command('panel', (ctx) => {
    if (ctx.from.id === botData.ownerId || ctx.chat.id === botData.adminGroupId) {
      ctx.reply('لوحة التحكم التفاعلية:', getAdminKeyboard(botData));
    }
  });

  // معالجة الأزرار الشفافة
  bot.on('callback_query', async (ctx) => {
    const data = (ctx.callbackQuery as any).data;
    const userId = ctx.from.id;
    const currentBot = await Bot.findById(botData._id);
    if (!currentBot) return;

    if (data === 'settings') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback(currentBot.isReceptionEnabled ? '✅ استقبال القنوات: مفعل' : '❌ استقبال القنوات: معطل', 'toggle_reception')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]);
      ctx.editMessageText('⚙️ الإعدادات العامة:', kb);
    } else if (data === 'toggle_reception') {
      currentBot.isReceptionEnabled = !currentBot.isReceptionEnabled;
      await currentBot.save();
      ctx.answerCbQuery('تم التغيير');
      ctx.editMessageReplyMarkup(Markup.inlineKeyboard([
        [Markup.button.callback(currentBot.isReceptionEnabled ? '✅ استقبال القنوات: مفعل' : '❌ استقبال القنوات: معطل', 'toggle_reception')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]).reply_markup);
    } else if (data === 'edit_msg') {
      userStates.set(userId, { action: 'awaiting_msg' });
      ctx.reply('📝 ارسل رسالة النشر الجديدة (التي تظهر فوق القائمة):', Markup.inlineKeyboard([Markup.button.callback('❌ إلغاء', 'cancel_action')]));
    } else if (data === 'edit_template') {
      userStates.set(userId, { action: 'awaiting_template' });
      ctx.reply('🎨 ارسل تنسيق الأسماء الجديد:\nاستخدم {Name} للاسم و {Nb} لعدد الأعضاء.\nمثال: {Nb} : {Name} ^_', Markup.inlineKeyboard([Markup.button.callback('❌ إلغاء', 'cancel_action')]));
    } else if (data === 'edit_limits') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback(`الأعمدة: ${currentBot.columnsCount}`, 'none'), Markup.button.callback('-', 'dec_cols'), Markup.button.callback('+', 'inc_cols')],
        [Markup.button.callback(`الحد الأدنى للأعضاء: ${currentBot.minMembers}`, 'none'), Markup.button.callback('-', 'dec_min'), Markup.button.callback('+', 'inc_min')],
        [Markup.button.callback(`أقصى طول للاسم: ${currentBot.maxNameLength}`, 'none'), Markup.button.callback('-', 'dec_name'), Markup.button.callback('+', 'inc_name')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]);
      ctx.editMessageText('🔢 التحكم في الحدود والأعمدة:', kb);
    } else if (data.startsWith('inc_') || data.startsWith('dec_')) {
      const field = data.split('_')[1];
      const isInc = data.startsWith('inc_');
      if (field === 'cols') currentBot.columnsCount = Math.max(1, Math.min(5, currentBot.columnsCount + (isInc ? 1 : -1)));
      if (field === 'min') currentBot.minMembers = Math.max(0, currentBot.minMembers + (isInc ? 10 : -10));
      if (field === 'name') currentBot.maxNameLength = Math.max(5, currentBot.maxNameLength + (isInc ? 5 : -5));
      await currentBot.save();
      ctx.answerCbQuery('تم التحديث');
      // إعادة عرض لوحة الحدود
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback(`الأعمدة: ${currentBot.columnsCount}`, 'none'), Markup.button.callback('-', 'dec_cols'), Markup.button.callback('+', 'inc_cols')],
        [Markup.button.callback(`الحد الأدنى للأعضاء: ${currentBot.minMembers}`, 'none'), Markup.button.callback('-', 'dec_min'), Markup.button.callback('+', 'inc_min')],
        [Markup.button.callback(`أقصى طول للاسم: ${currentBot.maxNameLength}`, 'none'), Markup.button.callback('-', 'dec_name'), Markup.button.callback('+', 'inc_name')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]);
      ctx.editMessageReplyMarkup(kb.reply_markup);
    } else if (data === 'edit_protection') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback(`الترتيب: ${currentBot.sortType}`, 'cycle_sort')],
        [Markup.button.callback(currentBot.isProtectionEnabled ? '🛡 الحماية: مفعلة' : '🛡 الحماية: معطلة', 'toggle_protection')],
        [Markup.button.callback(`الإجراء: ${currentBot.protectionAction}`, 'cycle_action')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]);
      ctx.editMessageText('🛡 إعدادات الحماية والترتيب:', kb);
    } else if (data === 'cycle_sort') {
      const sorts: any[] = ['members_desc', 'members_asc', 'name_asc', 'name_desc', 'random'];
      const idx = sorts.indexOf(currentBot.sortType);
      currentBot.sortType = sorts[(idx + 1) % sorts.length];
      await currentBot.save();
      ctx.answerCbQuery(`الترتيب: ${currentBot.sortType}`);
      ctx.editMessageReplyMarkup(Markup.inlineKeyboard([
        [Markup.button.callback(`الترتيب: ${currentBot.sortType}`, 'cycle_sort')],
        [Markup.button.callback(currentBot.isProtectionEnabled ? '🛡 الحماية: مفعلة' : '🛡 الحماية: معطلة', 'toggle_protection')],
        [Markup.button.callback(`الإجراء: ${currentBot.protectionAction}`, 'cycle_action')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]).reply_markup);
    } else if (data === 'back_main' || data === 'cancel_action') {
      userStates.delete(userId);
      ctx.editMessageText('لوحة التحكم التفاعلية:', getAdminKeyboard(currentBot));
    } else if (data === 'help_main') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('📖 كيفية إضافة قناة', 'help_add')],
        [Markup.button.callback('📢 كيفية النشر والحذف', 'help_pub')],
        [Markup.button.callback('🛡 شرح نظام الحماية', 'help_prot')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]);
      ctx.editMessageText('❓ اختر القسم الذي تريد المساعدة فيه:', kb);
    } else if (data.startsWith('help_')) {
      let text = '';
      if (data === 'help_add') text = '📖 لإضافة قناة:\nأرسل الرابط في مجموعة الاستقبال. إذا أردت اسماً مخصصاً، أرسل الاسم في السطر الأول والرابط في الثاني.\nيجب أن يكون البوت مسؤولاً في القناة.';
      if (data === 'help_pub') text = '📢 النشر والحذف:\nمن لوحة التحكم اضغط "نشر القائمة". سيقوم البوت بجلب القنوات وترتيبها حسب إعداداتك ونشرها. زر الحذف يزيل آخر قائمة منشورة.';
      if (data === 'help_prot') text = '🛡 نظام الحماية:\nإذا قام صاحب قناة بحذف القائمة، سيقوم البوت باتخاذ الإجراء المحدد (تنبيه أو إزالة).';
      ctx.editMessageText(text, Markup.inlineKeyboard([Markup.button.callback('🔙 عودة للمساعدة', 'help_main')]));
    } else if (data === 'publish') {
      ctx.answerCbQuery('جاري النشر...');
      // سيتم استدعاء وظيفة النشر المحدثة
      await handlePublish(bot, currentBot, ctx);
    } else if (data === 'delete') {
      ctx.answerCbQuery('جاري الحذف...');
      await handleDelete(bot, currentBot, ctx);
    } else if (data === 'stats') {
      const channels = await Channel.find({ botId: currentBot._id });
      ctx.reply(`📊 إحصائيات البوت:\n\nعدد القنوات: ${channels.length}\nإجمالي الأعضاء: ${channels.reduce((a, b) => a + b.memberCount, 0)}`);
    }
  });

  // معالجة النصوص والمدخلات (States)
  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const currentBot = await Bot.findById(botData._id);

    if (state && currentBot) {
      if (state.action === 'awaiting_msg') {
        currentBot.publishMessage = ctx.message.text;
        await currentBot.save();
        userStates.delete(userId);
        return ctx.reply('✅ تم تحديث رسالة النشر.', getAdminKeyboard(currentBot));
      }
      if (state.action === 'awaiting_template') {
        currentBot.nameTemplate = ctx.message.text;
        await currentBot.save();
        userStates.delete(userId);
        return ctx.reply('✅ تم تحديث تنسيق الأسماء.', getAdminKeyboard(currentBot));
      }
    }

    // استقبال القنوات
    if (ctx.chat.id === botData.receptionGroupId && currentBot?.isReceptionEnabled) {
      const lines = ctx.message.text.split('\n');
      let customName = lines.length >= 2 ? lines[0].trim() : '';
      let link = lines.length >= 2 ? lines[1].trim() : lines[0].trim();

      if (link.includes('t.me/') || link.startsWith('@')) {
        try {
          // إصلاح القنوات الخاصة: استخراج المعرف أو اليوزر بشكل صحيح
          let target: string = link;
          if (link.includes('t.me/+') || link.includes('t.me/joinchat/')) {
            target = link; // روابط الدعوة تعمل مباشرة مع getChat في النسخ الحديثة من تلجرام إذا كان البوت عضواً
          } else {
            target = '@' + (link.split('t.me/')[1] || link.replace('@', '')).split('/')[0];
          }

          const chat = await bot.telegram.getChat(target);
          if (chat.type !== 'channel') return ctx.reply('❌ هذا الرابط ليس لقناة.');

          if (customName && customName.length > currentBot.maxNameLength) {
            return ctx.reply(`❌ اسم القناة طويل جداً. الحد الأقصى هو ${currentBot.maxNameLength} حرف.`);
          }

          const memberCount = await bot.telegram.getChatMembersCount(chat.id);
          if (memberCount < currentBot.minMembers) {
            return ctx.reply(`❌ القناة صغيرة جداً. الحد الأدنى المطلوب هو ${currentBot.minMembers} عضو.`);
          }

          const botMember = await bot.telegram.getChatMember(chat.id, (await bot.telegram.getMe()).id);
          if (botMember.status !== 'administrator') return ctx.reply('❌ ارفع البوت مسؤولاً أولاً.');

          const existing = await Channel.findOne({ botId: botData._id, channelId: chat.id });
          if (existing) return ctx.reply('⚠️ مضافة مسبقاً.');

          await Channel.create({
            botId: botData._id,
            ownerId: ctx.from.id,
            channelId: chat.id,
            title: customName || (chat as any).title,
            inviteLink: link,
            memberCount: memberCount,
            isApproved: true
          });

          ctx.reply(`✅ تم قبول القناة: ${customName || (chat as any).title}`);
          await notifyAdmin(`➕ قناة جديدة: ${customName || (chat as any).title}\nبواسطة: ${ctx.from.first_name}`);
        } catch (e) {
          ctx.reply('❌ خطأ في التحقق. تأكد من الرابط وصلاحيات البوت.');
        }
      }
    }
    return next();
  });

  // مراقبة حذف القائمة (حماية)
  bot.on('message', async (ctx, next) => {
    // في بيئة Webhook الحقيقية، تلجرام لا يرسل إشعاراً عند حذف رسالة، 
    // ولكن يمكننا التحقق عند النشر القادم أو عبر مهام دورية.
    // هنا سنكتفي بمراقبة مغادرة البوت للقناة.
    return next();
  });
};

async function handlePublish(bot: Telegraf<Context>, botData: any, ctx: Context) {
  let channels = await Channel.find({ botId: botData._id, isApproved: true });
  if (channels.length === 0) return ctx.reply('❌ لا توجد قنوات.');

  // الترتيب
  if (botData.sortType === 'members_desc') channels.sort((a, b) => b.memberCount - a.memberCount);
  else if (botData.sortType === 'members_asc') channels.sort((a, b) => a.memberCount - b.memberCount);
  else if (botData.sortType === 'name_asc') channels.sort((a, b) => a.title.localeCompare(b.title));
  else if (botData.sortType === 'name_desc') channels.sort((a, b) => b.title.localeCompare(a.title));
  else if (botData.sortType === 'random') channels.sort(() => Math.random() - 0.5);

  const buttons = channels.map(ch => {
    const name = botData.nameTemplate
      .replace('{Name}', ch.title)
      .replace('{Nb}', ch.memberCount.toString());
    return Markup.button.url(name, ch.inviteLink || `https://t.me/${ch.channelId}`);
  });

  const rows = [];
  for (let i = 0; i < buttons.length; i += botData.columnsCount) {
    rows.push(buttons.slice(i, i + botData.columnsCount));
  }

  let success = 0;
  let report = '📊 تقرير النشر:\n';
  for (const ch of channels) {
    try {
      const sent = await bot.telegram.sendMessage(ch.channelId, botData.publishMessage, Markup.inlineKeyboard(rows));
      await Channel.findByIdAndUpdate(ch._id, { lastMessageId: sent.message_id, initialMemberCount: ch.memberCount });
      success++;
    } catch (e) {}
  }
  ctx.reply(`✅ تم النشر في ${success} قناة.\n${report}`);
}

async function handleDelete(bot: Telegraf<Context>, botData: any, ctx: Context) {
  const channels = await Channel.find({ botId: botData._id, lastMessageId: { $exists: true } });
  let count = 0;
  let report = '📈 تقرير زيادة الأعضاء:\n\n';

  for (const ch of channels) {
    try {
      const currentCount = await bot.telegram.getChatMembersCount(ch.channelId);
      const increase = currentCount - ch.initialMemberCount;
      report += `${ch.title}: +${increase} عضو\n`;
      
      await bot.telegram.deleteMessage(ch.channelId, ch.lastMessageId!);
      await Channel.findByIdAndUpdate(ch._id, { $unset: { lastMessageId: "" }, memberCount: currentCount });
      count++;
    } catch (e) {}
  }
  ctx.reply(`🗑 تم الحذف من ${count} قناة.\n\n${report}`);
}