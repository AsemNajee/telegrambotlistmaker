import { Context, Telegraf, Markup } from 'telegraf';
import Bot, { IBot } from '../models/Bot';
import Channel from '../models/Channel';

const userStates: Map<number, { action: string, data?: any }> = new Map();

export const setupChildBot = (bot: Telegraf<Context>, botData: IBot) => {
  
  const notifyAdmin = async (message: string) => {
    if (botData.adminGroupId) {
      try {
        await bot.telegram.sendMessage(botData.adminGroupId, `🔔 إشعار إداري:\n${message}`);
      } catch (e) {}
    }
  };

  // --- لوحات التحكم (Keyboards) ---

  const getMainMenu = () => Markup.inlineKeyboard([
    [Markup.button.callback('📜 إعدادات القائمة', 'menu_list'), Markup.button.callback('📥 إعدادات الاستقبال', 'menu_reception')],
    [Markup.button.callback('👀 مراقبة القنوات', 'menu_watch'), Markup.button.callback('📊 الإحصائيات', 'stats')],
    [Markup.button.callback('🚀 رفع القائمة', 'bump_list'), Markup.button.callback('📢 نشر جديد', 'publish')],
    [Markup.button.callback('🗑 حذف القائمة', 'delete'), Markup.button.callback('❓ المساعدة', 'help_main')]
  ]);

  const getListSettingsMenu = (b: IBot) => Markup.inlineKeyboard([
    [Markup.button.callback(`🔗 معاينة الروابط: ${b.isPreviewEnabled ? '✅' : '❌'}`, 'toggle_preview')],
    [Markup.button.callback(`📝 نوع القائمة: ${b.listType === 'buttons' ? 'أزرار' : 'نص'}`, 'toggle_list_type')],
    [Markup.button.callback('🔢 عدد الأعمدة', 'menu_cols'), Markup.button.callback('⚖️ الترتيب حسب', 'menu_sort')],
    [Markup.button.callback('🎨 تنسيق الاسم', 'menu_style'), Markup.button.callback('📝 رسالة الرأس', 'edit_head')],
    [Markup.button.callback('🔙 عودة', 'back_main')]
  ]);

  const getReceptionMenu = (b: IBot) => Markup.inlineKeyboard([
    [Markup.button.callback(`📥 الاستقبال: ${b.isReceptionEnabled ? '✅' : '❌'}`, 'toggle_reception')],
    [Markup.button.callback(`🔒 القنوات الخاصة: ${b.isPrivateReceptionEnabled ? '✅' : '❌'}`, 'toggle_private')],
    [Markup.button.callback('👥 الحد الأدنى للأعضاء', 'edit_min_members')],
    [Markup.button.callback('📏 أقصى طول للاسم', 'edit_max_name')],
    [Markup.button.callback('🔙 عودة', 'back_main')]
  ]);

  // --- المعالجات الموحدة (Unified Handlers) ---

  const showMainPanel = async (ctx: Context) => {
    const b = await Bot.findById(botData._id);
    if (!b) return;
    const text = `👑 لوحة تحكم البوت: @${b.botUsername}\n\nاختر القسم الذي تريد إدارته من الأزرار أدناه:`;
    if (ctx.callbackQuery) await ctx.editMessageText(text, getMainMenu());
    else await ctx.reply(text, getMainMenu());
  };

  bot.start(showMainPanel);
  bot.command('panel', showMainPanel);
  bot.command('control', showMainPanel);

  bot.on('callback_query', async (ctx) => {
    const data = (ctx.callbackQuery as any).data;
    const b = await Bot.findById(botData._id);
    if (!b) return;

    if (data === 'menu_list') ctx.editMessageText('📜 إعدادات القائمة:', getListSettingsMenu(b));
    else if (data === 'menu_reception') ctx.editMessageText('📥 إعدادات الاستقبال:', getReceptionMenu(b));
    else if (data === 'back_main') showMainPanel(ctx);
    else if (data === 'toggle_preview') {
      b.isPreviewEnabled = !b.isPreviewEnabled;
      await b.save();
      ctx.editMessageReplyMarkup(getListSettingsMenu(b).reply_markup);
    } else if (data === 'toggle_list_type') {
      b.listType = b.listType === 'buttons' ? 'text' : 'buttons';
      await b.save();
      ctx.editMessageReplyMarkup(getListSettingsMenu(b).reply_markup);
    } else if (data === 'edit_head') {
      userStates.set(ctx.from!.id, { action: 'awaiting_head' });
      ctx.reply('📝 أرسل رسالة الرأس الجديدة (يمكنك توجيه منشور يحتوي على صورة أو فيديو):', Markup.inlineKeyboard([Markup.button.callback('❌ إلغاء', 'back_main')]));
    } else if (data === 'menu_sort') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('👥 الأعضاء (تنازلي)', 'sort_members_desc'), Markup.button.callback('👥 الأعضاء (تصاعدي)', 'sort_members_asc')],
        [Markup.button.callback('🔤 الاسم (تصاعدي)', 'sort_name_asc'), Markup.button.callback('🔤 الاسم (تنازلي)', 'sort_name_desc')],
        [Markup.button.callback('📅 التاريخ (تنازلي)', 'sort_date_desc'), Markup.button.callback('🔙 عودة', 'menu_list')]
      ]);
      ctx.editMessageText('⚖️ اختر طريقة ترتيب القنوات:', kb);
    } else if (data.startsWith('sort_')) {
      b.sortType = data.replace('sort_', '') as any;
      await b.save();
      ctx.answerCbQuery('تم تحديث الترتيب');
      ctx.editMessageText('📜 إعدادات القائمة:', getListSettingsMenu(b));
    } else if (data === 'menu_style') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('- {Name}', 'style_1'), Markup.button.callback('{Nb} | {Name}', 'style_2')],
        [Markup.button.callback('{Nb} - {Name}', 'style_3'), Markup.button.callback('➕ إضافة مخصص', 'edit_template')],
        [Markup.button.callback('🔙 عودة', 'menu_list')]
      ]);
      ctx.editMessageText('🎨 اختر زخرفة جاهزة أو أضف مخصصاً:', kb);
    } else if (data.startsWith('style_')) {
      const styles: any = { 'style_1': '- {Name}', 'style_2': '{Nb} | {Name}', 'style_3': '{Nb} - {Name}' };
      b.nameTemplate = styles[data];
      await b.save();
      ctx.answerCbQuery('تم تطبيق الزخرفة');
      ctx.editMessageText('📜 إعدادات القائمة:', getListSettingsMenu(b));
    } else if (data === 'publish') {
      await handlePublish(bot, b, ctx);
    } else if (data === 'bump_list') {
      await handleBump(bot, b, ctx);
    } else if (data === 'delete') {
      await handleDelete(bot, b, ctx);
    }
  });

  // --- معالجة الرسائل (التوجيه والوسائط) ---

  bot.on('message', async (ctx, next) => {
    const userId = ctx.from!.id;
    const state = userStates.get(userId);
    const b = await Bot.findById(botData._id);
    if (!b) return next();

    // إضافة قناة خاصة عبر التوجيه
    if (ctx.chat.id === b.receptionGroupId && ctx.message && (ctx.message as any).forward_from_chat) {
      const forward = (ctx.message as any).forward_from_chat;
      if (forward.type === 'channel') {
        try {
          const chat = await bot.telegram.getChat(forward.id);
          const memberCount = await bot.telegram.getChatMembersCount(chat.id);
          const botMember = await bot.telegram.getChatMember(chat.id, (await bot.telegram.getMe()).id);
          
          if (botMember.status !== 'administrator') return ctx.reply('❌ ارفع البوت مسؤولاً في القناة أولاً.');

          const existing = await Channel.findOne({ botId: b._id, channelId: chat.id });
          if (existing) return ctx.reply('⚠️ القناة مضافة مسبقاً.');

          await Channel.create({
            botId: b._id,
            ownerId: userId,
            channelId: chat.id,
            title: (chat as any).title,
            inviteLink: (chat as any).invite_link || `https://t.me/${(chat as any).username}`,
            memberCount: memberCount,
            isApproved: true
          });

          ctx.reply(`✅ تم قبول القناة الخاصة: ${(chat as any).title}`);
          if (b.notifyAdminOnNewChannel) notifyAdmin(`➕ قناة خاصة جديدة: ${(chat as any).title}`);
          return;
        } catch (e) {
          ctx.reply('❌ تعذر التحقق. تأكد من صلاحيات البوت.');
        }
      }
    }

    // تعديل رسالة الرأس (نص + وسائط)
    if (state?.action === 'awaiting_head') {
      const msg = ctx.message as any;
      b.publishMessage = msg.text || msg.caption || '';
      
      if (msg.photo) b.publishMedia = { fileId: msg.photo[msg.photo.length - 1].file_id, type: 'photo' };
      else if (msg.video) b.publishMedia = { fileId: msg.video.file_id, type: 'video' };
      else if (msg.animation) b.publishMedia = { fileId: msg.animation.file_id, type: 'animation' };
      else b.publishMedia = undefined;

      await b.save();
      userStates.delete(userId);
      return ctx.reply('✅ تم تحديث رسالة الرأس والوسائط.', getMainMenu());
    }

    return next();
  });
};

async function handlePublish(bot: Telegraf<Context>, b: any, ctx: Context) {
  const channels = await Channel.find({ botId: b._id, isApproved: true });
  if (channels.length === 0) return ctx.reply('❌ لا توجد قنوات.');

  // الترتيب المتقدم
  if (b.sortType === 'members_desc') channels.sort((a, b) => b.memberCount - a.memberCount);
  else if (b.sortType === 'members_asc') channels.sort((a, b) => a.memberCount - b.memberCount);
  else if (b.sortType === 'name_asc') channels.sort((a, b) => a.title.localeCompare(b.title));
  else if (b.sortType === 'date_desc') channels.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  for (const ch of channels) {
    try {
      const sent = await sendList(bot, ch.channelId, b, channels);
      await Channel.findByIdAndUpdate(ch._id, { lastMessageId: sent.message_id, initialMemberCount: ch.memberCount });
    } catch (e) {}
  }
  ctx.reply('✅ تم النشر في جميع القنوات.');
}

async function handleBump(bot: Telegraf<Context>, b: any, ctx: Context) {
  const channels = await Channel.find({ botId: b._id, lastMessageId: { $exists: true } });
  for (const ch of channels) {
    try {
      await bot.telegram.deleteMessage(ch.channelId, ch.lastMessageId!);
      const sent = await sendList(bot, ch.channelId, b, channels);
      ch.lastMessageId = sent.message_id;
      await ch.save();
    } catch (e) {}
  }
  ctx.reply('🚀 تم رفع القائمة (حذف وإعادة نشر).');
}

async function handleDelete(bot: Telegraf<Context>, b: any, ctx: Context) {
  const channels = await Channel.find({ botId: b._id, lastMessageId: { $exists: true } });
  for (const ch of channels) {
    try {
      await bot.telegram.deleteMessage(ch.channelId, ch.lastMessageId!);
      await Channel.findByIdAndUpdate(ch._id, { $unset: { lastMessageId: "" } });
    } catch (e) {}
  }
  ctx.reply('🗑 تم حذف القائمة من جميع القنوات.');
}

async function sendList(bot: Telegraf<Context>, chatId: number, b: any, channels: any[]) {
  const textList = channels.map(ch => {
    const name = b.nameTemplate.replace('{Name}', ch.title).replace('{Nb}', ch.memberCount.toString());
    return b.listType === 'text' ? `• [${name}](${ch.inviteLink})` : name;
  });

  const extra: any = { parse_mode: 'Markdown', disable_web_page_preview: !b.isPreviewEnabled };

  if (b.listType === 'buttons') {
    const buttons = textList.map((name, i) => Markup.button.url(name, channels[i].inviteLink));
    const rows = [];
    for (let i = 0; i < buttons.length; i += b.columnsCount) {
      rows.push(buttons.slice(i, i + b.columnsCount));
    }
    extra.reply_markup = Markup.inlineKeyboard(rows).reply_markup;
  }

  const content = b.listType === 'text' ? `${b.publishMessage}\n\n${textList.join('\n')}` : b.publishMessage;

  if (b.publishMedia) {
    const { fileId, type } = b.publishMedia;
    if (type === 'photo') return await bot.telegram.sendPhoto(chatId, fileId, { caption: content, ...extra });
    if (type === 'video') return await bot.telegram.sendVideo(chatId, fileId, { caption: content, ...extra });
    if (type === 'animation') return await bot.telegram.sendAnimation(chatId, fileId, { caption: content, ...extra });
  }
  return await bot.telegram.sendMessage(chatId, content, extra);
}