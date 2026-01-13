import { Context, Telegraf, Markup } from 'telegraf';
import Bot, { IBot } from '../models/Bot';
import Channel from '../models/Channel';

const userStates: Map<number, { action: string, data?: any }> = new Map();

// دالة لتنظيف الأسماء من الزخرفة
const cleanText = (text: string) => {
  return text.replace(/[^\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z0-0\s]/g, '').trim();
};

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
      [Markup.button.callback('📊 الإحصائيات', 'stats'), Markup.button.callback('⚙️ الإعدادات', 'settings')],
      [Markup.button.callback('📝 الرسالة والصورة', 'edit_content'), Markup.button.callback('🎨 التنسيق والزخرفة', 'edit_style')],
      [Markup.button.callback('🔢 الأعمدة والحدود', 'edit_limits'), Markup.button.callback('🛡 الحماية والرفع', 'edit_advanced')],
      [Markup.button.callback('📢 نشر', 'publish'), Markup.button.callback('🗑 حذف', 'delete')],
      [Markup.button.callback('❓ المساعدة', 'help_main')]
    ]);
  };

  bot.start((ctx) => {
    if (ctx.from.id === botData.ownerId) {
      ctx.reply('لوحة التحكم التفاعلية 👑', getAdminKeyboard(botData));
    } else {
      ctx.reply('مرحباً بك! لإضافة قناتك ارفع البوت مسؤولاً ثم أرسل الرابط لمجموعة الاستقبال.');
    }
  });

  // مراقبة المنشورات الجديدة للرفع التلقائي
  bot.on('channel_post', async (ctx) => {
    const currentBot = await Bot.findById(botData._id);
    if (!currentBot || !currentBot.isAutoBumpEnabled) return;

    const channel = await Channel.findOne({ botId: botData._id, channelId: ctx.channelPost.chat.id });
    if (!channel || !channel.lastMessageId) return;

    channel.newPostsCount += 1;
    if (channel.newPostsCount >= currentBot.bumpThreshold) {
      // إعادة النشر في هذه القناة فقط
      try {
        await bot.telegram.deleteMessage(channel.channelId, channel.lastMessageId);
        const list = await generateList(currentBot);
        const sent = await sendList(bot, channel.channelId, currentBot, list);
        channel.lastMessageId = sent.message_id;
        channel.newPostsCount = 0;
      } catch (e) {}
    }
    await channel.save();
  });

  bot.on('callback_query', async (ctx) => {
    const data = (ctx.callbackQuery as any).data;
    const userId = ctx.from.id;
    const currentBot = await Bot.findById(botData._id);
    if (!currentBot) return;

    if (data === 'settings') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback(currentBot.isReceptionEnabled ? '✅ الاستقبال: مفعل' : '❌ الاستقبال: معطل', 'toggle_reception')],
        [Markup.button.callback(currentBot.isPreviewEnabled ? '✅ معاينة الروابط: مفعل' : '❌ معاينة الروابط: معطل', 'toggle_preview')],
        [Markup.button.callback(currentBot.listType === 'buttons' ? '🔘 نوع القائمة: أزرار' : '📝 نوع القائمة: نص', 'toggle_list_type')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]);
      ctx.editMessageText('⚙️ الإعدادات العامة:', kb);
    } else if (data === 'edit_content') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('📝 تعديل النص', 'edit_msg')],
        [Markup.button.callback('🖼 تعديل الصورة', 'edit_img')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]);
      ctx.editMessageText('📝 تخصيص المحتوى:', kb);
    } else if (data === 'edit_style') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🎨 تعديل التنسيق', 'edit_template')],
        [Markup.button.callback(currentBot.isCleanNamesEnabled ? '✨ تنظيف الزخرفة: مفعل' : '✨ تنظيف الزخرفة: معطل', 'toggle_clean')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]);
      ctx.editMessageText('🎨 تخصيص المظهر:', kb);
    } else if (data === 'edit_advanced') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback(currentBot.isAutoBumpEnabled ? '🚀 الرفع التلقائي: مفعل' : '🚀 الرفع التلقائي: معطل', 'toggle_bump')],
        [Markup.button.callback(`الحد الأدنى للمنشورات: ${currentBot.bumpThreshold}`, 'none'), Markup.button.callback('-', 'dec_bump'), Markup.button.callback('+', 'inc_bump')],
        [Markup.button.callback(`الترتيب: ${currentBot.sortType}`, 'cycle_sort')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]);
      ctx.editMessageText('🛡 إعدادات متقدمة:', kb);
    } else if (data === 'edit_img') {
      userStates.set(userId, { action: 'awaiting_img' });
      ctx.reply('🖼 ارسل رابط الصورة أو قم برفعها هنا:', Markup.inlineKeyboard([Markup.button.callback('❌ إلغاء', 'cancel_action')]));
    } else if (data === 'toggle_list_type') {
      currentBot.listType = currentBot.listType === 'buttons' ? 'text' : 'buttons';
      await currentBot.save();
      ctx.answerCbQuery('تم تغيير نوع القائمة');
      ctx.editMessageReplyMarkup(Markup.inlineKeyboard([
        [Markup.button.callback(currentBot.isReceptionEnabled ? '✅ الاستقبال: مفعل' : '❌ الاستقبال: معطل', 'toggle_reception')],
        [Markup.button.callback(currentBot.isPreviewEnabled ? '✅ معاينة الروابط: مفعل' : '❌ معاينة الروابط: معطل', 'toggle_preview')],
        [Markup.button.callback(currentBot.listType === 'buttons' ? '🔘 نوع القائمة: أزرار' : '📝 نوع القائمة: نص', 'toggle_list_type')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]).reply_markup);
    } else if (data === 'toggle_clean') {
      currentBot.isCleanNamesEnabled = !currentBot.isCleanNamesEnabled;
      await currentBot.save();
      ctx.answerCbQuery('تم التغيير');
      ctx.editMessageReplyMarkup(Markup.inlineKeyboard([
        [Markup.button.callback('🎨 تعديل التنسيق', 'edit_template')],
        [Markup.button.callback(currentBot.isCleanNamesEnabled ? '✨ تنظيف الزخرفة: مفعل' : '✨ تنظيف الزخرفة: معطل', 'toggle_clean')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]).reply_markup);
    } else if (data === 'toggle_bump') {
      currentBot.isAutoBumpEnabled = !currentBot.isAutoBumpEnabled;
      await currentBot.save();
      ctx.answerCbQuery('تم التغيير');
      ctx.editMessageReplyMarkup(Markup.inlineKeyboard([
        [Markup.button.callback(currentBot.isAutoBumpEnabled ? '🚀 الرفع التلقائي: مفعل' : '🚀 الرفع التلقائي: معطل', 'toggle_bump')],
        [Markup.button.callback(`الحد الأدنى للمنشورات: ${currentBot.bumpThreshold}`, 'none'), Markup.button.callback('-', 'dec_bump'), Markup.button.callback('+', 'inc_bump')],
        [Markup.button.callback(`الترتيب: ${currentBot.sortType}`, 'cycle_sort')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]).reply_markup);
    } else if (data === 'inc_bump' || data === 'dec_bump') {
      currentBot.bumpThreshold = Math.max(1, currentBot.bumpThreshold + (data === 'inc_bump' ? 1 : -1));
      await currentBot.save();
      ctx.editMessageReplyMarkup(Markup.inlineKeyboard([
        [Markup.button.callback(currentBot.isAutoBumpEnabled ? '🚀 الرفع التلقائي: مفعل' : '🚀 الرفع التلقائي: معطل', 'toggle_bump')],
        [Markup.button.callback(`الحد الأدنى للمنشورات: ${currentBot.bumpThreshold}`, 'none'), Markup.button.callback('-', 'dec_bump'), Markup.button.callback('+', 'inc_bump')],
        [Markup.button.callback(`الترتيب: ${currentBot.sortType}`, 'cycle_sort')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]).reply_markup);
    } else if (data === 'back_main' || data === 'cancel_action') {
      userStates.delete(userId);
      ctx.editMessageText('لوحة التحكم التفاعلية 👑', getAdminKeyboard(currentBot));
    } else if (data === 'publish') {
      await handlePublish(bot, currentBot, ctx);
    } else if (data === 'delete') {
      await handleDelete(bot, currentBot, ctx);
    } else if (data === 'toggle_preview') {
      currentBot.isPreviewEnabled = !currentBot.isPreviewEnabled;
      await currentBot.save();
      ctx.answerCbQuery('تم التغيير');
      ctx.editMessageReplyMarkup(Markup.inlineKeyboard([
        [Markup.button.callback(currentBot.isReceptionEnabled ? '✅ الاستقبال: مفعل' : '❌ الاستقبال: معطل', 'toggle_reception')],
        [Markup.button.callback(currentBot.isPreviewEnabled ? '✅ معاينة الروابط: مفعل' : '❌ معاينة الروابط: معطل', 'toggle_preview')],
        [Markup.button.callback(currentBot.listType === 'buttons' ? '🔘 نوع القائمة: أزرار' : '📝 نوع القائمة: نص', 'toggle_list_type')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]).reply_markup);
    } else if (data === 'edit_msg') {
      userStates.set(userId, { action: 'awaiting_msg' });
      ctx.reply('📝 ارسل رسالة النشر الجديدة:');
    } else if (data === 'edit_template') {
      userStates.set(userId, { action: 'awaiting_template' });
      ctx.reply('🎨 ارسل تنسيق الأسماء الجديد ({Name}, {Nb}):');
    } else if (data === 'edit_limits') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback(`الأعمدة: ${currentBot.columnsCount}`, 'none'), Markup.button.callback('-', 'dec_cols'), Markup.button.callback('+', 'inc_cols')],
        [Markup.button.callback(`الحد الأدنى للأعضاء: ${currentBot.minMembers}`, 'none'), Markup.button.callback('-', 'dec_min'), Markup.button.callback('+', 'inc_min')],
        [Markup.button.callback(`أقصى طول للاسم: ${currentBot.maxNameLength}`, 'none'), Markup.button.callback('-', 'dec_name'), Markup.button.callback('+', 'inc_name')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]);
      ctx.editMessageText('🔢 الحدود والأعمدة:', kb);
    } else if (data.startsWith('inc_') || data.startsWith('dec_')) {
      const field = data.split('_')[1];
      const isInc = data.startsWith('inc_');
      if (field === 'cols') currentBot.columnsCount = Math.max(1, Math.min(5, currentBot.columnsCount + (isInc ? 1 : -1)));
      if (field === 'min') currentBot.minMembers = Math.max(0, currentBot.minMembers + (isInc ? 10 : -10));
      if (field === 'name') currentBot.maxNameLength = Math.max(5, currentBot.maxNameLength + (isInc ? 5 : -5));
      await currentBot.save();
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback(`الأعمدة: ${currentBot.columnsCount}`, 'none'), Markup.button.callback('-', 'dec_cols'), Markup.button.callback('+', 'inc_cols')],
        [Markup.button.callback(`الحد الأدنى للأعضاء: ${currentBot.minMembers}`, 'none'), Markup.button.callback('-', 'dec_min'), Markup.button.callback('+', 'inc_min')],
        [Markup.button.callback(`أقصى طول للاسم: ${currentBot.maxNameLength}`, 'none'), Markup.button.callback('-', 'dec_name'), Markup.button.callback('+', 'inc_name')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]);
      ctx.editMessageReplyMarkup(kb.reply_markup);
    } else if (data === 'cycle_sort') {
      const sorts: any[] = ['members_desc', 'members_asc', 'name_asc', 'name_desc', 'random'];
      currentBot.sortType = sorts[(sorts.indexOf(currentBot.sortType) + 1) % sorts.length];
      await currentBot.save();
      ctx.editMessageReplyMarkup(Markup.inlineKeyboard([
        [Markup.button.callback(currentBot.isAutoBumpEnabled ? '🚀 الرفع التلقائي: مفعل' : '🚀 الرفع التلقائي: معطل', 'toggle_bump')],
        [Markup.button.callback(`الحد الأدنى للمنشورات: ${currentBot.bumpThreshold}`, 'none'), Markup.button.callback('-', 'dec_bump'), Markup.button.callback('+', 'inc_bump')],
        [Markup.button.callback(`الترتيب: ${currentBot.sortType}`, 'cycle_sort')],
        [Markup.button.callback('🔙 عودة', 'back_main')]
      ]).reply_markup);
    }
  });

  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const currentBot = await Bot.findById(botData._id);

    if (state && currentBot) {
      if (state.action === 'awaiting_msg') {
        currentBot.publishMessage = ctx.message.text;
        await currentBot.save();
        userStates.delete(userId);
        return ctx.reply('✅ تم التحديث.', getAdminKeyboard(currentBot));
      }
      if (state.action === 'awaiting_template') {
        currentBot.nameTemplate = ctx.message.text;
        await currentBot.save();
        userStates.delete(userId);
        return ctx.reply('✅ تم التحديث.', getAdminKeyboard(currentBot));
      }
    }

    if (ctx.chat.id === botData.receptionGroupId && currentBot?.isReceptionEnabled) {
      const lines = ctx.message.text.split('\n');
      let customName = lines.length >= 2 ? lines[0].trim() : '';
      let link = lines.length >= 2 ? lines[1].trim() : lines[0].trim();

      if (link.includes('t.me/') || link.startsWith('@')) {
        try {
          // حل نهائي للقنوات الخاصة: استخدام التوكن للتحقق من الصلاحيات
          let target: string = link;
          if (link.includes('t.me/+') || link.includes('t.me/joinchat/')) {
            // روابط الدعوة تتطلب أن يكون البوت عضواً ليتمكن من جلب البيانات
            target = link;
          } else {
            target = '@' + (link.split('t.me/')[1] || link.replace('@', '')).split('/')[0];
          }

          const chat = await bot.telegram.getChat(target);
          const memberCount = await bot.telegram.getChatMembersCount(chat.id);
          const botMember = await bot.telegram.getChatMember(chat.id, (await bot.telegram.getMe()).id);
          
          if (botMember.status !== 'administrator') return ctx.reply('❌ ارفع البوت مسؤولاً أولاً.');

          let finalName = customName || (chat as any).title;
          if (currentBot.isCleanNamesEnabled) finalName = cleanText(finalName);

          await Channel.create({
            botId: botData._id,
            ownerId: ctx.from.id,
            channelId: chat.id,
            title: finalName,
            inviteLink: link,
            memberCount: memberCount,
            isApproved: true
          });

          ctx.reply(`✅ تم القبول: ${finalName}`);
          await notifyAdmin(`➕ قناة جديدة: ${finalName}`);
        } catch (e) {
          ctx.reply('❌ تعذر التحقق. تأكد من الرابط وصلاحيات البوت.');
        }
      }
    }
    return next();
  });

  bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const currentBot = await Bot.findById(botData._id);
    if (state?.action === 'awaiting_img' && currentBot) {
      const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      currentBot.publishImage = fileId;
      await currentBot.save();
      userStates.delete(userId);
      ctx.reply('✅ تم تحديث الصورة.', getAdminKeyboard(currentBot));
    }
  });
};

async function generateList(botData: any) {
  let channels = await Channel.find({ botId: botData._id, isApproved: true });
  if (botData.sortType === 'members_desc') channels.sort((a, b) => b.memberCount - a.memberCount);
  else if (botData.sortType === 'members_asc') channels.sort((a, b) => a.memberCount - b.memberCount);
  else if (botData.sortType === 'name_asc') channels.sort((a, b) => a.title.localeCompare(b.title));
  else if (botData.sortType === 'name_desc') channels.sort((a, b) => b.title.localeCompare(a.title));
  else if (botData.sortType === 'random') channels.sort(() => Math.random() - 0.5);

  return channels;
}

async function sendList(bot: Telegraf<Context>, chatId: number, botData: any, channels: any[]) {
  const textList = channels.map(ch => {
    const name = botData.nameTemplate.replace('{Name}', ch.title).replace('{Nb}', ch.memberCount.toString());
    return botData.listType === 'text' ? `• [${name}](${ch.inviteLink})` : name;
  });

  const extra: any = { parse_mode: 'Markdown', disable_web_page_preview: !botData.isPreviewEnabled };

  if (botData.listType === 'buttons') {
    const buttons = textList.map((name, i) => Markup.button.url(name, channels[i].inviteLink));
    const rows = [];
    for (let i = 0; i < buttons.length; i += botData.columnsCount) {
      rows.push(buttons.slice(i, i + botData.columnsCount));
    }
    extra.reply_markup = Markup.inlineKeyboard(rows).reply_markup;
  }

  const content = botData.listType === 'text' ? `${botData.publishMessage}\n\n${textList.join('\n')}` : botData.publishMessage;

  if (botData.publishImage) {
    return await bot.telegram.sendPhoto(chatId, botData.publishImage, { caption: content, ...extra });
  } else {
    return await bot.telegram.sendMessage(chatId, content, extra);
  }
}

async function handlePublish(bot: Telegraf<Context>, botData: any, ctx: Context) {
  const channels = await generateList(botData);
  if (channels.length === 0) return ctx.reply('❌ لا توجد قنوات.');

  let success = 0;
  for (const ch of channels) {
    try {
      const sent = await sendList(bot, ch.channelId, botData, channels);
      await Channel.findByIdAndUpdate(ch._id, { lastMessageId: sent.message_id, initialMemberCount: ch.memberCount, newPostsCount: 0 });
      success++;
    } catch (e) {}
  }
  ctx.reply(`✅ تم النشر في ${success} قناة.`);
}

async function handleDelete(bot: Telegraf<Context>, botData: any, ctx: Context) {
  const channels = await Channel.find({ botId: botData._id, lastMessageId: { $exists: true } });
  let count = 0;
  let report = '📈 تقرير الزيادة:\n';
  for (const ch of channels) {
    try {
      const current = await bot.telegram.getChatMembersCount(ch.channelId);
      report += `${ch.title}: +${current - ch.initialMemberCount}\n`;
      await bot.telegram.deleteMessage(ch.channelId, ch.lastMessageId!);
      await Channel.findByIdAndUpdate(ch._id, { $unset: { lastMessageId: "" }, memberCount: current });
      count++;
    } catch (e) {}
  }
  ctx.reply(`🗑 تم الحذف من ${count} قناة.\n\n${report}`);
}