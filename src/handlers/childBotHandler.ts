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
    [Markup.button.callback(`🔗 المعاينة: ${b.isPreviewEnabled ? '✅' : '❌'}`, 'toggle_preview')],
    [Markup.button.callback(`📝 النوع: ${b.listType === 'buttons' ? 'أزرار' : 'نص'}`, 'toggle_list_type')],
    [Markup.button.callback(`🔢 الأعمدة: ${b.columnsCount}`, 'menu_cols')],
    [Markup.button.callback('⚖️ إعدادات الترتيب', 'menu_order')],
    [Markup.button.callback('🎨 تنسيق الاسم والزخرفة', 'menu_style')],
    [Markup.button.callback('📝 رسالة الرأس', 'edit_head')],
    [Markup.button.callback('🔄 تحديث القنوات', 'menu_update_channels')],
    [Markup.button.callback('👁 معاينة فورية', 'live_preview')],
    [Markup.button.callback('🔙 عودة', 'back_main')]
  ]);

  const getReceptionMenu = (b: IBot) => Markup.inlineKeyboard([
    [Markup.button.callback(`📥 الاستقبال: ${b.isReceptionEnabled ? '✅' : '❌'}`, 'toggle_reception')],
    [Markup.button.callback(`🔒 القنوات الخاصة: ${b.isPrivateReceptionEnabled ? '✅' : '❌'}`, 'toggle_private')],
    [Markup.button.callback(`👥 الحد الأدنى: ${b.minMembers}`, 'menu_min_members')],
    [Markup.button.callback(`📏 أقصى طول للاسم: ${(b as any).maxNameLength || 30}`, 'menu_max_name')],
    [Markup.button.callback(`🔔 إشعار المسؤول (بوت): ${(b as any).notifyAdminBot ? '✅' : '❌'}`, 'toggle_notify_bot')],
    [Markup.button.callback(`🔔 إشعار المسؤول (قناة): ${(b as any).notifyAdminChannel ? '✅' : '❌'}`, 'toggle_notify_channel')],
    [Markup.button.callback('🔙 عودة', 'back_main')]
  ]);

  const getWatchMenu = (b: IBot) => Markup.inlineKeyboard([
    [Markup.button.callback(`🔄 إعادة نشر عند الحذف: ${(b as any).autoRepublishOnDelete ? '✅' : '❌'}`, 'toggle_republish_delete')],
    [Markup.button.callback(`🚀 الرفع التلقائي: ${b.isAutoBumpEnabled ? '✅' : '❌'}`, 'toggle_auto_bump')],
    [Markup.button.callback(`⚙️ حد الرفع: ${b.bumpThreshold || 5}`, 'menu_bump_threshold')],
    [Markup.button.callback(`🛡 الحماية: ${b.isProtectionEnabled ? '✅' : '❌'}`, 'toggle_protection')],
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

    // --- List Settings Submenus ---
    else if (data === 'toggle_preview') { b.isPreviewEnabled = !b.isPreviewEnabled; await b.save(); ctx.editMessageReplyMarkup(getListSettingsMenu(b).reply_markup); }
    else if (data === 'menu_cols') {
      ctx.editMessageText('🔢 اختر عدد الأعمدة:', Markup.inlineKeyboard([
        [Markup.button.callback('1 عمود', 'set_col_1'), Markup.button.callback('2 عمودين', 'set_col_2'), Markup.button.callback('3 أعمدة', 'set_col_3')],
        [Markup.button.callback('🔙 عودة', 'menu_list')]
      ]));
    }
    else if (data.startsWith('set_col_')) {
      b.columnsCount = parseInt(data.split('_')[2]);
      await b.save();
      ctx.editMessageText('📜 إعدادات القائمة:', getListSettingsMenu(b));
    }
    else if (data === 'menu_order') {
      ctx.editMessageText('⚖️ إعدادات الترتيب:', Markup.inlineKeyboard([
        [Markup.button.callback('🔤 الاسم (A-Z)', 'order_name_asc'), Markup.button.callback('🔤 الاسم (Z-A)', 'order_name_desc')],
        [Markup.button.callback('👥 الأعضاء (الأكثر)', 'order_members_desc'), Markup.button.callback('👥 الأعضاء (الأقل)', 'order_members_asc')],
        [Markup.button.callback('📅 التاريخ (الأحدث)', 'order_date_desc'), Markup.button.callback('📅 التاريخ (الأقدم)', 'order_date_asc')],
        [Markup.button.callback('🔙 عودة', 'menu_list')]
      ]));
    }
    else if (data.startsWith('order_')) {
      b.sortType = data.replace('order_', '');
      await b.save();
      ctx.answerCbQuery('تم تحديث الترتيب');
      ctx.editMessageText('📜 إعدادات القائمة:', getListSettingsMenu(b));
    }
    else if (data === 'menu_style') {
      const styles = ['- {Name}', '{Nb} | {Name}', '{Nb} - {Name}', '🔹 {Name} [ {Nb} ]', '✨ {Name} ✨', '📢 {Name} ({Nb})'];
      ctx.editMessageText('🎨 تنسيق الاسم والزخرفة:', Markup.inlineKeyboard([
        ...styles.map((s, i) => [Markup.button.callback(s, `setstyle_${i}`)]),
        [Markup.button.callback('➕ إضافة مخصص', 'edit_template')],
        [Markup.button.callback(`🧹 تنظيف الأسماء: ${(b as any).cleanNames ? '✅' : '❌'}`, 'toggle_clean_names')],
        [Markup.button.callback('🔙 عودة', 'menu_list')]
      ]));
    }
    else if (data.startsWith('setstyle_')) {
      const idx = parseInt(data.split('_')[1]);
      const styles = ['- {Name}', '{Nb} | {Name}', '{Nb} - {Name}', '🔹 {Name} [ {Nb} ]', '✨ {Name} ✨', '📢 {Name} ({Nb})'];
      b.nameTemplate = styles[idx];
      await b.save();
      ctx.answerCbQuery('تم التطبيق');
      ctx.editMessageText('📜 إعدادات القائمة:', getListSettingsMenu(b));
    }
    else if (data === 'toggle_clean_names') { (b as any).cleanNames = !(b as any).cleanNames; await b.save(); ctx.editMessageReplyMarkup((ctx.callbackQuery as any).message.reply_markup); }

    // --- Reception Submenus ---
    else if (data === 'menu_min_members') {
      ctx.editMessageText(`👥 الحد الأدنى الحالي: ${b.minMembers}\nاستخدم الأزرار للزيادة أو النقصان:`, Markup.inlineKeyboard([
        [Markup.button.callback('+1', 'min_+1'), Markup.button.callback('+10', 'min_+10'), Markup.button.callback('+100', 'min_+100'), Markup.button.callback('+1k', 'min_+1000'), Markup.button.callback('+10K', 'min_+10000')],
        [Markup.button.callback('-1', 'min_-1'), Markup.button.callback('-10', 'min_-10'), Markup.button.callback('-100', 'min_-100'), Markup.button.callback('-1k', 'min_-1000'), Markup.button.callback('-10K', 'min_-10000')],
        [Markup.button.callback('🔙 عودة', 'menu_reception')]
      ]));
    }
    else if (data.startsWith('min_')) {
      const val = parseInt(data.split('_')[1].replace('k', '000').replace('K', '0000'));
      b.minMembers = Math.max(0, b.minMembers + val);
      await b.save();
      ctx.editMessageText(`👥 الحد الأدنى الحالي: ${b.minMembers}\nاستخدم الأزرار للزيادة أو النقصان:`, (ctx.callbackQuery as any).message.reply_markup);
    }
    else if (data === 'menu_max_name') {
      ctx.editMessageText(`📏 أقصى طول للاسم: ${(b as any).maxNameLength || 30}\nاستخدم الأزرار للتعديل:`, Markup.inlineKeyboard([
        [Markup.button.callback('+1', 'maxname_+1'), Markup.button.callback('+5', 'maxname_+5'), Markup.button.callback('+10', 'maxname_+10')],
        [Markup.button.callback('-1', 'maxname_-1'), Markup.button.callback('-5', 'maxname_-5'), Markup.button.callback('-10', 'maxname_-10')],
        [Markup.button.callback('🔙 عودة', 'menu_reception')]
      ]));
    }
    else if (data.startsWith('maxname_')) {
      const val = parseInt(data.split('_')[1]);
      (b as any).maxNameLength = Math.max(1, ((b as any).maxNameLength || 30) + val);
      await b.save();
      ctx.editMessageText(`📏 أقصى طول للاسم: ${(b as any).maxNameLength || 30}\nاستخدم الأزرار للتعديل:`, (ctx.callbackQuery as any).message.reply_markup);
    }

    // --- Watch Submenus ---
    else if (data === 'menu_bump_threshold') {
      ctx.editMessageText(`⚙️ حد الرفع الحالي: ${b.bumpThreshold || 5}\n(عدد المنشورات قبل إعادة النشر)`, Markup.inlineKeyboard([
        [Markup.button.callback('+1', 'bump_+1'), Markup.button.callback('+5', 'bump_+5'), Markup.button.callback('+10', 'bump_+10')],
        [Markup.button.callback('-1', 'bump_-1'), Markup.button.callback('-5', 'bump_-5'), Markup.button.callback('-10', 'bump_-10')],
        [Markup.button.callback('🔙 عودة', 'menu_watch')]
      ]));
    }
    else if (data.startsWith('bump_')) {
      const val = parseInt(data.split('_')[1]);
      b.bumpThreshold = Math.max(1, (b.bumpThreshold || 5) + val);
      await b.save();
      ctx.editMessageText(`⚙️ حد الرفع الحالي: ${b.bumpThreshold || 5}\n(عدد المنشورات قبل إعادة النشر)`, (ctx.callbackQuery as any).message.reply_markup);
    }

    // --- Toggles ---
    else if (data === 'toggle_notify_bot') { (b as any).notifyAdminBot = !(b as any).notifyAdminBot; await b.save(); ctx.editMessageReplyMarkup(getReceptionMenu(b).reply_markup); }
    else if (data === 'toggle_notify_channel') { (b as any).notifyAdminChannel = !(b as any).notifyAdminChannel; await b.save(); ctx.editMessageReplyMarkup(getReceptionMenu(b).reply_markup); }
    else if (data === 'toggle_republish_delete') { (b as any).autoRepublishOnDelete = !(b as any).autoRepublishOnDelete; await b.save(); ctx.editMessageReplyMarkup(getWatchMenu(b).reply_markup); }
    else if (data === 'toggle_list_type') { b.listType = b.listType === 'buttons' ? 'text' : 'buttons'; await b.save(); ctx.editMessageReplyMarkup(getListSettingsMenu(b).reply_markup); }
    else if (data === 'toggle_reception') { b.isReceptionEnabled = !b.isReceptionEnabled; await b.save(); ctx.editMessageReplyMarkup(getReceptionMenu(b).reply_markup); }
    else if (data === 'toggle_private') { b.isPrivateReceptionEnabled = !b.isPrivateReceptionEnabled; await b.save(); ctx.editMessageReplyMarkup(getReceptionMenu(b).reply_markup); }
    else if (data === 'toggle_auto_bump') { b.isAutoBumpEnabled = !b.isAutoBumpEnabled; await b.save(); ctx.editMessageReplyMarkup(getWatchMenu(b).reply_markup); }
    else if (data === 'toggle_protection') { b.isProtectionEnabled = !b.isProtectionEnabled; await b.save(); ctx.editMessageReplyMarkup(getWatchMenu(b).reply_markup); }

    // --- Actions ---
    else if (data === 'menu_update_channels') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('📝 تحديث الأسماء', 'update_names'), Markup.button.callback('👥 تحديث الأعضاء', 'update_members')],
        [Markup.button.callback('🔄 تحديث الكل', 'update_all')],
        [Markup.button.callback('🔙 عودة', 'menu_list')]
      ]);
      ctx.editMessageText('🔄 اختر نوع التحديث المطلوب للقنوات:', kb);
    }
    else if (data.startsWith('update_')) {
      const type = data.split('_')[1];
      await ctx.reply('⏳ بدأ تحديث القنوات، يرجى الانتظار...');
      await handleUpdateChannels(bot, b, type);
      await ctx.reply('✅ انتهى تحديث القنوات بنجاح.');
      ctx.editMessageText('📜 إعدادات القائمة:', getListSettingsMenu(b));
    }
    else if (data === 'stats') {
      const channelsCount = await Channel.countDocuments({ botId: b._id, isApproved: true });
      const totalMembers = (await Channel.find({ botId: b._id, isApproved: true })).reduce((acc, ch) => acc + ch.memberCount, 0);
      ctx.reply(`📊 إحصائيات البوت:\n\n✅ القنوات المعتمدة: ${channelsCount}\n👥 إجمالي الأعضاء: ${totalMembers}`, Markup.inlineKeyboard([Markup.button.callback('🔙 عودة', 'back_main')]));
    }
    else if (data === 'help_main') {
      try {
        const helpPath = path.join(process.cwd(), 'HELP.md');
        const helpText = fs.readFileSync(helpPath, 'utf-8');
        ctx.reply(helpText, { parse_mode: 'HTML', ...Markup.inlineKeyboard([Markup.button.callback('🔙 عودة', 'back_main')]) });
      } catch (e) { ctx.reply('❓ المساعدة غير متوفرة.'); }
    }
    else if (data === 'publish') await handlePublish(bot, b, ctx);
    else if (data === 'bump_list') await handleBump(bot, b, ctx);
    else if (data === 'delete') await handleDelete(bot, b, ctx);
    else if (data === 'live_preview') {
      const channels = await Channel.find({ botId: b._id, isApproved: true }).limit(10);
      await sendList(bot, ctx.chat!.id, b, channels, true);
    }
    else if (data === 'edit_head') {
      userStates.set(ctx.from!.id, { action: 'awaiting_head' });
      ctx.reply('📝 أرسل رسالة الرأس الجديدة (نص أو ميديا).\n💡 يمكنك إعادة توجيه (Forward) أي منشور لاستنساخه:', Markup.inlineKeyboard([Markup.button.callback('❌ إلغاء', 'menu_list')]));
    }
    else if (data === 'edit_template') {
      userStates.set(ctx.from!.id, { action: 'edit_template' });
      ctx.reply('🎨 أرسل التنسيق المخصص الجديد:', Markup.inlineKeyboard([Markup.button.callback('❌ إلغاء', 'menu_style')]));
    }
  });

  // --- Logic Handlers ---
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

  bot.on('my_chat_member', async (ctx) => {
    const b = await Bot.findById(botData._id);
    if (!b) return;
    if (ctx.myChatMember.new_chat_member.status === 'administrator') {
      if ((b as any).notifyAdminBot) await notifyAdmin(`🤖 تم إضافة البوت كمسؤول في قناة جديدة.`);
    }
    if (b.isProtectionEnabled && (ctx.myChatMember.new_chat_member.status === 'left' || ctx.myChatMember.new_chat_member.status === 'kicked')) {
      const channel = await Channel.findOne({ botId: b._id, channelId: ctx.chat.id });
      if (channel) {
        await notifyAdmin(`⚠️ تم طرد البوت من قناة: ${channel.title}`);
        if ((b as any).autoRepublishOnDelete) await handleBump(bot, b, ctx);
        await channel.deleteOne();
      }
    }
  });

  bot.on('message', async (ctx, next) => {
    const b = await Bot.findById(botData._id);
    if (!b) return next();
    const msg = ctx.message as any;

    if (b.isReceptionEnabled && (ctx.chat.id === b.receptionGroupId || ctx.chat.type === 'private')) {
      if (msg.forward_from_chat && msg.forward_from_chat.type === 'channel') return handleChannelAdd(bot, b, ctx, msg.forward_from_chat.id);
      const text = msg.text || msg.caption || '';
      const channelMatch = text.match(/t\.me\/([a-zA-Z0-9_]{5,})/);
      if (channelMatch) return handleChannelAdd(bot, b, ctx, `@${channelMatch[1]}`);
    }

    const state = userStates.get(ctx.from!.id);
    if (state?.action === 'awaiting_head') {
      b.publishMessage = msg.text || msg.caption || '';
      if (msg.photo) b.publishMedia = { fileId: msg.photo[msg.photo.length - 1].file_id, type: 'photo' };
      else if (msg.video) b.publishMedia = { fileId: msg.video.file_id, type: 'video' };
      else if (msg.animation) b.publishMedia = { fileId: msg.animation.file_id, type: 'animation' };
      else b.publishMedia = undefined;
      await b.save();
      userStates.delete(ctx.from!.id);
      ctx.reply('✅ تم تحديث الرأس. معاينة:');
      const channels = await Channel.find({ botId: b._id, isApproved: true }).limit(5);
      return sendList(bot, ctx.chat!.id, b, channels, true);
    }
    if (state?.action === 'edit_template') {
      if (msg.text) { b.nameTemplate = msg.text; await b.save(); userStates.delete(ctx.from!.id); return ctx.reply('✅ تم تحديث التنسيق.', getMainMenu()); }
    }
    return next();
  });
};

async function handleChannelAdd(bot: Telegraf<Context>, b: any, ctx: Context, channelIdentifier: string | number) {
  try {
    const chat = await bot.telegram.getChat(channelIdentifier);
    const memberCount = await bot.telegram.getChatMembersCount(chat.id);
    if (memberCount < b.minMembers) return ctx.reply(`❌ القناة لا تستوفي الحد الأدنى (${b.minMembers}).`);
    const existing = await Channel.findOne({ botId: b._id, channelId: chat.id });
    if (existing) return ctx.reply('⚠️ القناة مضافة مسبقاً.');
    await Channel.create({ botId: b._id, ownerId: ctx.from!.id, channelId: chat.id, title: (chat as any).title, inviteLink: (chat as any).invite_link || `https://t.me/${(chat as any).username}`, memberCount: memberCount, isApproved: true });
    ctx.reply(`✅ تم قبول القناة: ${(chat as any).title}`);
    if ((b as any).notifyAdminChannel) {
      const adminMsg = `➕ قناة جديدة مضافة للقائمة: ${(chat as any).title}\n👥 الأعضاء: ${memberCount}`;
      if (b.adminGroupId) await bot.telegram.sendMessage(b.adminGroupId, adminMsg);
    }
  } catch (e) { ctx.reply('❌ تعذر التحقق.'); }
}

async function handleUpdateChannels(bot: Telegraf<Context>, b: any, type: string) {
  const channels = await Channel.find({ botId: b._id });
  for (const ch of channels) {
    try {
      const chat = await bot.telegram.getChat(ch.channelId);
      if (type === 'names' || type === 'all') ch.title = (chat as any).title;
      if (type === 'members' || type === 'all') ch.memberCount = await bot.telegram.getChatMembersCount(ch.channelId);
      await ch.save();
    } catch (e) {}
  }
}

async function handlePublish(bot: Telegraf<Context>, b: any, ctx: Context) {
  const channels = await Channel.find({ botId: b._id, isApproved: true });
  if (channels.length === 0) return ctx.reply('❌ لا توجد قنوات.');
  
  // تطبيق الترتيب
  if (b.sortType === 'members_desc') channels.sort((a, b) => b.memberCount - a.memberCount);
  else if (b.sortType === 'members_asc') channels.sort((a, b) => a.memberCount - b.memberCount);
  else if (b.sortType === 'name_asc') channels.sort((a, b) => a.title.localeCompare(b.title));
  else if (b.sortType === 'name_desc') channels.sort((a, b) => b.title.localeCompare(a.title));
  else if (b.sortType === 'date_desc') channels.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  else if (b.sortType === 'date_asc') channels.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const ch of channels) {
    try {
      const sent = await sendList(bot, ch.channelId, b, channels);
      await Channel.findByIdAndUpdate(ch._id, { lastMessageId: sent.message_id, initialMemberCount: ch.memberCount });
    } catch (e) {}
  }
  ctx.reply('✅ تم النشر.');
}

async function handleBump(bot: Telegraf<Context>, b: any, ctx: Context) {
  const channels = await Channel.find({ botId: b._id, lastMessageId: { $exists: true } });
  const allApproved = await Channel.find({ botId: b._id, isApproved: true });
  for (const ch of channels) {
    try {
      await bot.telegram.deleteMessage(ch.channelId, ch.lastMessageId!);
      const sent = await sendList(bot, ch.channelId, b, allApproved);
      ch.lastMessageId = sent.message_id;
      await ch.save();
    } catch (e) {}
  }
  if (ctx.callbackQuery) ctx.reply('🚀 تم الرفع.');
}

async function handleDelete(bot: Telegraf<Context>, b: any, ctx: Context) {
  const channels = await Channel.find({ botId: b._id, lastMessageId: { $exists: true } });
  let report = '📊 تقرير زيادة الأعضاء:\n\n';
  for (const ch of channels) {
    try {
      const currentCount = await bot.telegram.getChatMembersCount(ch.channelId);
      const increase = currentCount - (ch.initialMemberCount || ch.memberCount);
      report += `• ${ch.title}: +${increase} عضو\n`;
      await bot.telegram.deleteMessage(ch.channelId, ch.lastMessageId!);
      await Channel.findByIdAndUpdate(ch._id, { $unset: { lastMessageId: "", initialMemberCount: "" } });
    } catch (e) {}
  }
  ctx.reply(report);
  ctx.reply('🗑 تم الحذف.');
}

async function sendList(bot: Telegraf<Context>, chatId: number, b: any, channels: any[], isPreview = false) {
  const textList = channels.map(ch => {
    let title = ch.title;
    if ((b as any).cleanNames) title = title.replace(/[^\w\s\u0600-\u06FF]/gi, '').trim();
    const name = b.nameTemplate.replace('{Name}', title).replace('{Nb}', ch.memberCount.toString());
    return b.listType === 'text' ? `• [${name}](${ch.inviteLink})` : name;
  });
  const extra: any = { parse_mode: 'Markdown', link_preview_options: { is_disabled: !b.isPreviewEnabled, prefer_small_media: true, show_above_text: (b as any).previewPosition === 'top' } };
  if (b.listType === 'buttons') {
    const buttons = textList.map((name, i) => Markup.button.url(name, channels[i].inviteLink));
    const rows = [];
    for (let i = 0; i < buttons.length; i += b.columnsCount) rows.push(buttons.slice(i, i + b.columnsCount));
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