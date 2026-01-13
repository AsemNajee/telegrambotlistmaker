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

  const getListSettingsMenu = (b: IBot) => {
    const sortLabels: any = { members_desc: '👥 الأعضاء ↓', members_asc: '👥 الأعضاء ↑', name_asc: '🔤 الاسم ↑', name_desc: '🔤 الاسم ↓', date_desc: '📅 التاريخ ↓' };
    return Markup.inlineKeyboard([
      [Markup.button.callback(`🔗 المعاينة: ${b.isPreviewEnabled ? '✅' : '❌'}`, 'menu_preview_settings')],
      [Markup.button.callback(`📝 النوع: ${b.listType === 'buttons' ? 'أزرار' : 'نص'}`, 'toggle_list_type')],
      [Markup.button.callback(`🔢 الأعمدة: ${b.columnsCount}`, 'cycle_cols'), Markup.button.callback(`⚖️ الترتيب: ${sortLabels[b.sortType || 'members_desc']}`, 'cycle_sort')],
      [Markup.button.callback('🎨 تنسيق الاسم', 'menu_style'), Markup.button.callback('📝 رسالة الرأس', 'edit_head')],
      [Markup.button.callback('🔄 تحديث القنوات', 'menu_update_channels')],
      [Markup.button.callback('👁 معاينة فورية', 'live_preview')],
      [Markup.button.callback('🔙 عودة', 'back_main')]
    ]);
  };

  const getReceptionMenu = (b: IBot) => Markup.inlineKeyboard([
    [Markup.button.callback(`📥 الاستقبال: ${b.isReceptionEnabled ? '✅' : '❌'}`, 'toggle_reception')],
    [Markup.button.callback(`🔒 القنوات الخاصة: ${b.isPrivateReceptionEnabled ? '✅' : '❌'}`, 'toggle_private')],
    [Markup.button.callback(`👥 الحد الأدنى: ${b.minMembers}`, 'cycle_min_members')],
    [Markup.button.callback('📏 أقصى طول للاسم', 'menu_max_name')],
    [Markup.button.callback('🔙 عودة', 'back_main')]
  ]);

  const getWatchMenu = (b: IBot) => Markup.inlineKeyboard([
    [Markup.button.callback(`🔄 الرفع التلقائي: ${b.isAutoBumpEnabled ? '✅' : '❌'}`, 'toggle_auto_bump')],
    [Markup.button.callback(`🛡 الحماية: ${b.isProtectionEnabled ? '✅' : '❌'}`, 'toggle_protection')],
    [Markup.button.callback(`⚙️ حد الرفع: ${b.bumpThreshold || 5}`, 'cycle_bump_threshold')],
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

    // --- تحديث فوري (Cycling) ---
    else if (data === 'cycle_cols') {
      b.columnsCount = b.columnsCount >= 5 ? 1 : b.columnsCount + 1;
      await b.save();
      ctx.editMessageReplyMarkup(getListSettingsMenu(b).reply_markup);
    }
    else if (data === 'cycle_sort') {
      const sorts: any[] = ['members_desc', 'members_asc', 'name_asc', 'name_desc', 'date_desc'];
      const currentIdx = sorts.indexOf(b.sortType || 'members_desc');
      b.sortType = sorts[(currentIdx + 1) % sorts.length];
      await b.save();
      ctx.editMessageReplyMarkup(getListSettingsMenu(b).reply_markup);
    }
    else if (data === 'cycle_min_members') {
      const steps = [0, 10, 50, 100, 500, 1000, 5000];
      const currentIdx = steps.indexOf(b.minMembers);
      b.minMembers = steps[(currentIdx + 1) % steps.length];
      await b.save();
      ctx.editMessageReplyMarkup(getReceptionMenu(b).reply_markup);
    }
    else if (data === 'cycle_bump_threshold') {
      b.bumpThreshold = (b.bumpThreshold || 5) >= 20 ? 1 : (b.bumpThreshold || 5) + 1;
      await b.save();
      ctx.editMessageReplyMarkup(getWatchMenu(b).reply_markup);
    }

    // --- التبديل (Toggles) ---
    else if (data === 'toggle_list_type') { b.listType = b.listType === 'buttons' ? 'text' : 'buttons'; await b.save(); ctx.editMessageReplyMarkup(getListSettingsMenu(b).reply_markup); }
    else if (data === 'toggle_reception') { b.isReceptionEnabled = !b.isReceptionEnabled; await b.save(); ctx.editMessageReplyMarkup(getReceptionMenu(b).reply_markup); }
    else if (data === 'toggle_private') { b.isPrivateReceptionEnabled = !b.isPrivateReceptionEnabled; await b.save(); ctx.editMessageReplyMarkup(getReceptionMenu(b).reply_markup); }
    else if (data === 'toggle_auto_bump') { b.isAutoBumpEnabled = !b.isAutoBumpEnabled; await b.save(); ctx.editMessageReplyMarkup(getWatchMenu(b).reply_markup); }
    else if (data === 'toggle_protection') { b.isProtectionEnabled = !b.isProtectionEnabled; await b.save(); ctx.editMessageReplyMarkup(getWatchMenu(b).reply_markup); }

    // --- إعدادات المعاينة ---
    else if (data === 'menu_preview_settings') {
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback(`تشغيل: ${b.isPreviewEnabled ? '✅' : '⚪️'}`, 'preview_on'), Markup.button.callback(`إيقاف: ${!b.isPreviewEnabled ? '✅' : '⚪️'}`, 'preview_off')],
        [Markup.button.callback(`قبل النص: ${(b as any).previewPosition === 'top' ? '✅' : '⚪️'}`, 'preview_top'), Markup.button.callback(`بعد النص: ${(b as any).previewPosition === 'bottom' ? '✅' : '⚪️'}`, 'preview_bottom')],
        [Markup.button.callback('🔙 عودة', 'menu_list')]
      ]);
      ctx.editMessageText('🔗 إعدادات معاينة الروابط:', kb);
    }
    else if (data.startsWith('preview_')) {
      const action = data.split('_')[1];
      if (action === 'on') b.isPreviewEnabled = true;
      else if (action === 'off') b.isPreviewEnabled = false;
      else (b as any).previewPosition = action;
      await b.save();
      ctx.editMessageReplyMarkup((ctx.callbackQuery as any).message.reply_markup);
    }

    // --- تحديث القنوات ---
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
      ctx.answerCbQuery('⏳ جاري التحديث...');
      await handleUpdateChannels(bot, b, type);
      ctx.reply('✅ اكتمل تحديث القنوات.');
      ctx.editMessageText('📜 إعدادات القائمة:', getListSettingsMenu(b));
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
        ctx.reply(helpText, { parse_mode: 'HTML', ...Markup.inlineKeyboard([Markup.button.callback('🔙 عودة', 'back_main')]) });
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
      const channelsWithList = await Channel.find({ botId: b._id, lastMessageId: { $exists: true } });
      if (channelsWithList.length > 0) return ctx.answerCbQuery('⚠️ القائمة منشورة بالفعل. احذفها أولاً.', { show_alert: true });
      await handlePublish(bot, b, ctx);
    }
    else if (data === 'bump_list') await handleBump(bot, b, ctx);
    else if (data === 'delete') await handleDelete(bot, b, ctx);
    
    else if (data === 'edit_head') {
      userStates.set(ctx.from!.id, { action: 'awaiting_head' });
      ctx.reply('📝 أرسل رسالة الرأس الجديدة (نص أو ميديا).\n💡 يمكنك إعادة توجيه (Forward) أي منشور لاستنساخه:', Markup.inlineKeyboard([Markup.button.callback('❌ إلغاء', 'back_main')]));
    }
    else if (data === 'edit_template') {
      userStates.set(ctx.from!.id, { action: 'edit_template' });
      ctx.reply('🎨 أرسل التنسيق المخصص الجديد:\nمثال: `{Nb} ~ {Name}`', Markup.inlineKeyboard([Markup.button.callback('❌ إلغاء', 'menu_style')]));
    }
  });

  // --- معالجة الرفع التلقائي والحماية ---
  bot.on('channel_post', async (ctx) => {
    const b = await Bot.findById(botData._id);
    if (!b) return;

    const channel = await Channel.findOne({ botId: b._id, channelId: ctx.chat.id });
    if (!channel) return;

    // الرفع التلقائي
    if (b.isAutoBumpEnabled && channel.lastMessageId) {
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
    }
    await channel.save();
  });

  // مراقبة حذف القائمة (Protection)
  bot.on('my_chat_member', async (ctx) => {
    const b = await Bot.findById(botData._id);
    if (!b || !b.isProtectionEnabled) return;
    if (ctx.myChatMember.new_chat_member.status === 'left' || ctx.myChatMember.new_chat_member.status === 'kicked') {
      const channel = await Channel.findOne({ botId: b._id, channelId: ctx.chat.id });
      if (channel) {
        await notifyAdmin(`⚠️ تم طرد البوت أو حذف القائمة من قناة: ${channel.title}`);
        await channel.deleteOne();
      }
    }
  });

  bot.on('message', async (ctx, next) => {
    const b = await Bot.findById(botData._id);
    if (!b) return next();

    const userId = ctx.from!.id;
    const msg = ctx.message as any;
    const isReceptionGroup = ctx.chat.id === b.receptionGroupId;

    // استقبال القنوات
    if (b.isReceptionEnabled && (isReceptionGroup || ctx.chat.type === 'private')) {
      if (msg.forward_from_chat && msg.forward_from_chat.type === 'channel') {
        return handleChannelAdd(bot, b, ctx, msg.forward_from_chat.id);
      }
      const text = msg.text || msg.caption || '';
      const channelMatch = text.match(/t\.me\/([a-zA-Z0-9_]{5,})/);
      if (channelMatch) return handleChannelAdd(bot, b, ctx, `@${channelMatch[1]}`);
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
      ctx.reply('✅ تم تحديث الرأس. معاينة:');
      const channels = await Channel.find({ botId: b._id, isApproved: true }).limit(5);
      return sendList(bot, ctx.chat!.id, b, channels, true);
    }

    if (state?.action === 'edit_template') {
      if (msg.text) {
        b.nameTemplate = msg.text;
        await b.save();
        userStates.delete(userId);
        return ctx.reply('✅ تم تحديث التنسيق.', getMainMenu());
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
    if (b.adminGroupId) {
      await bot.telegram.sendMessage(b.adminGroupId, `➕ قناة جديدة مضافة: ${(chat as any).title}`);
    }
  } catch (e) {
    ctx.reply('❌ تعذر التحقق. تأكد من الرابط وصلاحيات البوت.');
  }
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

  for (const ch of channels) {
    try {
      const sent = await sendList(bot, ch.channelId, b, channels);
      await Channel.findByIdAndUpdate(ch._id, { lastMessageId: sent.message_id });
    } catch (e) {}
  }
  ctx.reply('✅ تم النشر.');
}

async function handleBump(bot: Telegraf<Context>, b: any, ctx: Context) {
  const channels = await Channel.find({ botId: b._id, lastMessageId: { $exists: true } });
  if (channels.length === 0) return ctx.reply('❌ لا توجد قائمة منشورة.');
  const allApproved = await Channel.find({ botId: b._id, isApproved: true });

  for (const ch of channels) {
    try {
      await bot.telegram.deleteMessage(ch.channelId, ch.lastMessageId!);
      const sent = await sendList(bot, ch.channelId, b, allApproved);
      ch.lastMessageId = sent.message_id;
      await ch.save();
    } catch (e) {}
  }
  ctx.reply('🚀 تم الرفع.');
}

async function handleDelete(bot: Telegraf<Context>, b: any, ctx: Context) {
  const channels = await Channel.find({ botId: b._id, lastMessageId: { $exists: true } });
  if (channels.length === 0) return ctx.reply('❌ لا توجد قائمة منشورة.');

  for (const ch of channels) {
    try {
      await bot.telegram.deleteMessage(ch.channelId, ch.lastMessageId!);
      await Channel.findByIdAndUpdate(ch._id, { $unset: { lastMessageId: "" } });
    } catch (e) {}
  }
  ctx.reply('🗑 تم الحذف.');
}

async function sendList(bot: Telegraf<Context>, chatId: number, b: any, channels: any[], isPreview = false) {
  const textList = channels.map(ch => {
    const name = b.nameTemplate.replace('{Name}', ch.title).replace('{Nb}', ch.memberCount.toString());
    return b.listType === 'text' ? `• [${name}](${ch.inviteLink})` : name;
  });

  const extra: any = { 
    parse_mode: 'Markdown', 
    link_preview_options: { 
      is_disabled: !b.isPreviewEnabled,
      prefer_small_media: true,
      show_above_text: (b as any).previewPosition === 'top'
    }
  };

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