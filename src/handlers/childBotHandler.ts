import { Context, Telegraf, Markup } from 'telegraf';
import Bot, { IBot } from '../models/Bot';
import Channel from '../models/Channel';
import fs from 'fs';
import path from 'path';

const userStates: Map<number, { action: string, data?: any }> = new Map();

export const setupChildBot = (bot: Telegraf<Context>, botData: IBot) => {
  
  const notifyAdmin = async (message: string) => {
    const b = await Bot.findById(botData._id);
    if (b?.adminGroupId) {
      try {
        await bot.telegram.sendMessage(b.adminGroupId, `🔔 إشعار إداري:\n${message}`);
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
    [Markup.button.callback(`🔢 الأعمدة: ${b.columnsCount}`, 'menu_cols'), Markup.button.callback('⚖️ الترتيب حسب', 'menu_sort')],
    [Markup.button.callback('🎨 تنسيق الاسم', 'menu_style'), Markup.button.callback('📝 رسالة الرأس', 'edit_head')],
    [Markup.button.callback('👁 معاينة فورية', 'live_preview')],
    [Markup.button.callback('🔙 عودة', 'back_main')]
  ]);

  const getReceptionMenu = (b: IBot) => Markup.inlineKeyboard([
    [Markup.button.callback(`📥 الاستقبال: ${b.isReceptionEnabled ? '✅' : '❌'}`, 'toggle_reception')],
    [Markup.button.callback(`🔒 القنوات الخاصة: ${b.isPrivateReceptionEnabled ? '✅' : '❌'}`, 'toggle_private')],
    [Markup.button.callback(`👥 الحد الأدنى: ${b.minMembers}`, 'menu_min_members')],
    [Markup.button.callback('📏 أقصى طول للاسم', 'menu_max_name')],
    [Markup.button.callback('🔙 عودة', 'back_main')]
  ]);

  const getWatchMenu = (b: IBot) => Markup.inlineKeyboard([
    [Markup.button.callback(`🔄 الرفع التلقائي: ${b.isAutoBumpEnabled ? '✅' : '❌'}`, 'toggle_auto_bump')],
    [Markup.button.callback(`🛡 الحماية: ${b.isProtectionEnabled ? '✅' : '❌'}`, 'toggle_protection')],
    [Markup.button.callback(`⚙️ إعدادات الرفع: ${b.bumpThreshold || 5}`, 'menu_bump_settings')],
    [Markup.button.callback('🔙 عودة', 'back_main')]
  ]);

  const showMainPanel = async (ctx: Context) => {
    const b = await Bot.findById(botData._id);
    if (!b) return;
    const text = `👑 لوحة تحكم البوت: @${b.botUsername}\n\nاختر القسم الذي تريد إدارته من الأزرار أدناه:`;
    if (ctx.callbackQuery) await ctx.editMessageText(text, getMainMenu());
    else await ctx.reply(text, getMainMenu());
  };

  bot.start(showMainPanel);
  bot.command(['panel', 'control'], showMainPanel);

  bot.command('set_admin', async (ctx) => {
    const b = await Bot.findById(botData._id);
    if (!b || b.ownerId !== ctx.from.id) return;
    b.adminGroupId = ctx.chat.id;
    await b.save();
    ctx.reply('✅ تم تعيين هذه المجموعة كمجموعة للإدارة.');
  });

  bot.command('set_reception', async (ctx) => {
    const b = await Bot.findById(botData._id);
    if (!b || b.ownerId !== ctx.from.id) return;
    b.receptionGroupId = ctx.chat.id;
    await b.save();
    ctx.reply('✅ تم تعيين هذه المجموعة كمجموعة لاستقبال القنوات.');
  });

  bot.on('callback_query', async (ctx) => {
    const data = (ctx.callbackQuery as any).data;
    const b = await Bot.findById(botData._id);
    if (!b) return;

    if (data === 'menu_list') ctx.editMessageText('📜 إعدادات القائمة:', getListSettingsMenu(b));
    else if (data === 'menu_reception') ctx.editMessageText('📥 إعدادات الاستقبال:', getReceptionMenu(b));
    else if (data === 'menu_watch') ctx.editMessageText('👀 مراقبة القنوات والرفع التلقائي:', getWatchMenu(b));
    else if (data === 'back_main') showMainPanel(ctx);

    else if (data === 'toggle_preview') { b.isPreviewEnabled = !b.isPreviewEnabled; await b.save(); ctx.editMessageReplyMarkup(getListSettingsMenu(b).reply_markup); }
    else if (data === 'toggle_list_type') { b.listType = b.listType === 'buttons' ? 'text' : 'buttons'; await b.save(); ctx.editMessageReplyMarkup(getListSettingsMenu(b).reply_markup); }
    else if (data === 'toggle_reception') { b.isReceptionEnabled = !b.isReceptionEnabled; await b.save(); ctx.editMessageReplyMarkup(getReceptionMenu(b).reply_markup); }
    else if (data === 'toggle_private') { b.isPrivateReceptionEnabled = !b.isPrivateReceptionEnabled; await b.save(); ctx.editMessageReplyMarkup(getReceptionMenu(b).reply_markup); }
    else if (data === 'toggle_auto_bump') { b.isAutoBumpEnabled = !b.isAutoBumpEnabled; await b.save(); ctx.editMessageReplyMarkup(getWatchMenu(b).reply_markup); }
    else if (data === 'toggle_protection') { b.isProtectionEnabled = !b.isProtectionEnabled; await b.save(); ctx.editMessageReplyMarkup(getWatchMenu(b).reply_markup); }

    else if (data === 'menu_sort') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('👥 الأعضاء (تنازلي)', 'sort_members_desc'), Markup.button.callback('👥 الأعضاء (تصاعدي)', 'sort_members_asc')],
        [Markup.button.callback('🔤 الاسم (تصاعدي)', 'sort_name_asc'), Markup.button.callback('🔤 الاسم (تنازلي)', 'sort_name_desc')],
        [Markup.button.callback('📅 التاريخ (تنازلي)', 'sort_date_desc'), Markup.button.callback('🔙 عودة', 'menu_list')]
      ]);
      ctx.editMessageText('⚖️ اختر طريقة ترتيب القنوات:', kb);
    }
    else if (data.startsWith('sort_')) {
      b.sortType = data.replace('sort_', '') as any;
      await b.save();
      ctx.answerCbQuery('تم تحديث الترتيب');
      ctx.editMessageText('📜 إعدادات القائمة:', getListSettingsMenu(b));
    }

    else if (data === 'menu_min_members') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('+10', 'add_min_10'), Markup.button.callback('+100', 'add_min_100'), Markup.button.callback('+1000', 'add_min_1000')],
        [Markup.button.callback('-10', 'sub_min_10'), Markup.button.callback('-100', 'sub_min_100'), Markup.button.callback('-1000', 'sub_min_1000')],
        [Markup.button.callback('🔙 عودة', 'menu_reception')]
      ]);
      ctx.editMessageText(`👥 الحد الأدنى للأعضاء الحالي: ${b.minMembers}`, kb);
    }
    else if (data.startsWith('add_min_') || data.startsWith('sub_min_')) {
      const val = parseInt(data.split('_')[2]);
      b.minMembers = data.startsWith('add_') ? b.minMembers + val : Math.max(0, b.minMembers - val);
      await b.save();
      ctx.answerCbQuery(`القيمة الجديدة: ${b.minMembers}`);
      ctx.editMessageText(`👥 الحد الأدنى للأعضاء الحالي: ${b.minMembers}`, (ctx.callbackQuery as any).message.reply_markup);
    }

    else if (data === 'menu_cols') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('➕ (1) زيادة', 'add_col_1'), Markup.button.callback('➖ (1) نقصان', 'sub_col_1')],
        [Markup.button.callback('🔙 عودة', 'menu_list')]
      ]);
      ctx.editMessageText(`🔢 عدد الأعمدة الحالي: ${b.columnsCount}`, kb);
    }
    else if (data.startsWith('add_col_') || data.startsWith('sub_col_')) {
      const val = parseInt(data.split('_')[2]);
      b.columnsCount = data.startsWith('add_') ? Math.min(5, b.columnsCount + val) : Math.max(1, b.columnsCount - val);
      await b.save();
      ctx.answerCbQuery(`القيمة: ${b.columnsCount}`);
      ctx.editMessageText(`🔢 عدد الأعمدة الحالي: ${b.columnsCount}`, (ctx.callbackQuery as any).message.reply_markup);
    }

    else if (data === 'menu_bump_settings') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('➕ (1) زيادة', 'add_bump_1'), Markup.button.callback('➖ (1) نقصان', 'sub_bump_1')],
        [Markup.button.callback('🔙 عودة', 'menu_watch')]
      ]);
      ctx.editMessageText(`❄️ عدد المنشورات المطلوبة للرفع: ${b.bumpThreshold || 5}`, kb);
    }
    else if (data.startsWith('add_bump_') || data.startsWith('sub_bump_')) {
      const val = parseInt(data.split('_')[2]);
      b.bumpThreshold = data.startsWith('add_') ? (b.bumpThreshold || 5) + val : Math.max(1, (b.bumpThreshold || 5) - val);
      await b.save();
      ctx.answerCbQuery(`القيمة: ${b.bumpThreshold}`);
      ctx.editMessageText(`❄️ عدد المنشورات المطلوبة للرفع: ${b.bumpThreshold}`, (ctx.callbackQuery as any).message.reply_markup);
    }

    else if (data === 'menu_style') {
      const styles = ['- {Name}', '{Nb} | {Name}', '{Nb} - {Name}', '🔹 {Name} [ {Nb} ]'];
      const kb = Markup.inlineKeyboard([
        ...styles.map((s, i) => [Markup.button.callback(s, `setstyle_${i}`)]),
        [Markup.button.callback('➕ إضافة مخصص', 'edit_template')],
        [Markup.button.callback('🔙 عودة', 'menu_list')]
      ]);
      ctx.editMessageText('🎨 اختر زخرفة جاهزة أو أضف مخصصاً:', kb);
    }
    else if (data.startsWith('setstyle_')) {
      const idx = parseInt(data.split('_')[1]);
      const styles = ['- {Name}', '{Nb} | {Name}', '{Nb} - {Name}', '🔹 {Name} [ {Nb} ]'];
      b.nameTemplate = styles[idx];
      await b.save();
      ctx.answerCbQuery('تم التطبيق');
      ctx.editMessageText('📜 إعدادات القائمة:', getListSettingsMenu(b));
    }

    else if (data === 'help_main') {
      try {
        const helpPath = path.join(process.cwd(), 'HELP.md');
        const helpText = fs.readFileSync(helpPath, 'utf-8');
        ctx.reply(helpText, Markup.inlineKeyboard([Markup.button.callback('🔙 عودة', 'back_main')]));
      } catch (e) {
        ctx.reply('❓ المساعدة غير متوفرة حالياً.', Markup.inlineKeyboard([Markup.button.callback('🔙 عودة', 'back_main')]));
      }
    }

    else if (data === 'stats') {
      const channelsCount = await Channel.countDocuments({ botId: b._id, isApproved: true });
      const totalMembers = (await Channel.find({ botId: b._id, isApproved: true })).reduce((acc, ch) => acc + ch.memberCount, 0);
      ctx.reply(`📊 إحصائيات البوت:\n\n✅ القنوات المعتمدة: ${channelsCount}\n👥 إجمالي الأعضاء: ${totalMembers}`, Markup.inlineKeyboard([Markup.button.callback('🔙 عودة', 'back_main')]));
    }

    else if (data === 'live_preview') {
      const channels = await Channel.find({ botId: b._id, isApproved: true }).limit(10);
      if (channels.length === 0) return ctx.answerCbQuery('❌ لا توجد قنوات للمعاينة.', { show_alert: true });
      await sendList(bot, ctx.chat!.id, b, channels, true);
    }

    else if (data === 'publish') {
      const activePublish = await Channel.findOne({ botId: b._id, lastMessageId: { $exists: true } });
      if (activePublish) return ctx.answerCbQuery('⚠️ يجب حذف القائمة الحالية قبل نشر قائمة جديدة.', { show_alert: true });
      await handlePublish(bot, b, ctx);
    }
    else if (data === 'bump_list') await handleBump(bot, b, ctx);
    else if (data === 'delete') await handleDelete(bot, b, ctx);
    
    else if (data === 'edit_head') {
      userStates.set(ctx.from!.id, { action: 'awaiting_head' });
      ctx.reply('📝 أرسل رسالة الرأس الجديدة (نص أو ميديا):', Markup.inlineKeyboard([Markup.button.callback('❌ إلغاء', 'back_main')]));
    }
  });

  bot.on('channel_post', async (ctx) => {
    const b = await Bot.findById(botData._id);
    if (!b || !b.isAutoBumpEnabled) return;

    const channel = await Channel.findOne({ botId: b._id, channelId: ctx.chat.id });
    if (!channel || !channel.lastMessageId) return;

    channel.newPostsCount = (channel.newPostsCount || 0) + 1;
    if (channel.newPostsCount >= (b.bumpThreshold || 5)) {
      try {
        await bot.telegram.deleteMessage(ctx.chat.id, channel.lastMessageId);
        const allApproved = await Channel.find({ botId: b._id, isApproved: true });
        const sent = await sendList(bot, ctx.chat.id, b, allApproved);
        channel.lastMessageId = sent.message_id;
        channel.newPostsCount = 0;
      } catch (e) {}
    }
    await channel.save();
  });

  bot.on('message', async (ctx, next) => {
    const b = await Bot.findById(botData._id);
    if (!b) return next();

    const userId = ctx.from!.id;
    const msg = ctx.message as any;
    const isReceptionGroup = ctx.chat.id === b.receptionGroupId;

    if (b.isReceptionEnabled && (isReceptionGroup || ctx.chat.type === 'private')) {
      if (msg.forward_from_chat && msg.forward_from_chat.type === 'channel') {
        return handleChannelAdd(bot, b, ctx, msg.forward_from_chat.id);
      }
      const text = msg.text || msg.caption || '';
      const channelMatch = text.match(/t\.me\/([a-zA-Z0-9_]{5,})/);
      if (channelMatch) {
        return handleChannelAdd(bot, b, ctx, `@${channelMatch[1]}`);
      }
    }

    const state = userStates.get(userId);
    if (state?.action === 'awaiting_head') {
      b.publishMessage = msg.text || msg.caption || '';
      if (msg.photo) b.publishMedia = { fileId: msg.photo[msg.photo.length - 1].file_id, type: 'photo' };
      else if (msg.video) b.publishMedia = { fileId: msg.video.file_id, type: 'video' };
      else if (msg.animation) b.publishMedia = { fileId: msg.animation.file_id, type: 'animation' };
      else b.publishMedia = undefined;

      await b.save();
      userStates.delete(userId);
      return ctx.reply('✅ تم تحديث رسالة الرأس والوسائط.', getMainMenu());
    }

    if (state?.action === 'edit_template') {
      if (msg.text) {
        b.nameTemplate = msg.text;
        await b.save();
        userStates.delete(userId);
        return ctx.reply('✅ تم تحديث التنسيق المخصص.', getMainMenu());
      }
    }

    return next();
  });
};

async function handleChannelAdd(bot: Telegraf<Context>, b: any, ctx: Context, channelIdentifier: string | number) {
  try {
    const chat = await bot.telegram.getChat(channelIdentifier);
    const memberCount = await bot.telegram.getChatMembersCount(chat.id);
    const botMember = await bot.telegram.getChatMember(chat.id, (await bot.telegram.getMe()).id);
    
    if (botMember.status !== 'administrator') return ctx.reply('❌ ارفع البوت مسؤولاً في القناة أولاً.');
    if (memberCount < b.minMembers) return ctx.reply(`❌ القناة لا تستوفي الحد الأدنى للأعضاء (${b.minMembers}).`);

    const existing = await Channel.findOne({ botId: b._id, channelId: chat.id });
    if (existing) return ctx.reply('⚠️ القناة مضافة مسبقاً.');

    await Channel.create({
      botId: b._id,
      ownerId: ctx.from!.id,
      channelId: chat.id,
      title: (chat as any).title,
      inviteLink: (chat as any).invite_link || `https://t.me/${(chat as any).username}`,
      memberCount: memberCount,
      isApproved: true
    });

    ctx.reply(`✅ تم قبول القناة: ${(chat as any).title}`);
    if (b.notifyAdminOnNewChannel && b.adminGroupId) {
      await bot.telegram.sendMessage(b.adminGroupId, `➕ قناة جديدة مضافة: ${(chat as any).title}`);
    }
  } catch (e) {
    ctx.reply('❌ تعذر التحقق. تأكد من الرابط وصلاحيات البوت.');
  }
}

async function handlePublish(bot: Telegraf<Context>, b: any, ctx: Context) {
  const channels = await Channel.find({ botId: b._id, isApproved: true });
  if (channels.length === 0) return ctx.reply('❌ لا توجد قنوات.');

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
  const allApproved = await Channel.find({ botId: b._id, isApproved: true });
  if (channels.length === 0) return ctx.reply('❌ لا توجد قائمة منشورة لرفعها.');

  for (const ch of channels) {
    try {
      await bot.telegram.deleteMessage(ch.channelId, ch.lastMessageId!);
      const sent = await sendList(bot, ch.channelId, b, allApproved);
      ch.lastMessageId = sent.message_id;
      await ch.save();
    } catch (e) {}
  }
  ctx.reply('🚀 تم رفع القائمة (حذف وإعادة نشر).');
}

async function handleDelete(bot: Telegraf<Context>, b: any, ctx: Context) {
  const channels = await Channel.find({ botId: b._id, lastMessageId: { $exists: true } });
  if (channels.length === 0) return ctx.reply('❌ لا توجد قائمة منشورة لحذفها.');

  for (const ch of channels) {
    try {
      await bot.telegram.deleteMessage(ch.channelId, ch.lastMessageId!);
      await Channel.findByIdAndUpdate(ch._id, { $unset: { lastMessageId: "" } });
    } catch (e) {}
  }
  ctx.reply('🗑 تم حذف القائمة من جميع القنوات.');
}

async function sendList(bot: Telegraf<Context>, chatId: number, b: any, channels: any[], isPreview = false) {
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