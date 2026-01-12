import { Context, Telegraf, Markup } from 'telegraf';
import Bot, { IBot } from '../models/Bot';
import Channel from '../models/Channel';

export const setupChildBot = (bot: Telegraf<Context>, botData: IBot) => {
  
  bot.start((ctx) => {
    if (ctx.from.id === botData.ownerId) {
      ctx.reply('مرحباً بك يا مالك البوت! 👑\n\nاستخدم الأوامر التالية:\n/set_admin - تعيين مجموعة الإدارة\n/set_reception - تعيين مجموعة الاستقبال\n/preview - معاينة القائمة\n/publish - نشر القائمة\n/delete - حذف القائمة\n/update_info - تحديث بيانات القنوات');
    } else {
      ctx.reply('مرحباً بك! هذا البوت مخصص لإدارة إعلانات القنوات.\n\nإذا كنت تملك قناة، قم برفع البوت كمسؤول في قناتك ثم أرسل رابط القناة إلى مجموعة الاستقبال المخصصة.');
    }
  });

  bot.command('set_admin', async (ctx) => {
    if (ctx.from.id !== botData.ownerId) return;
    if (ctx.chat.type === 'private') return ctx.reply('يجب إرسال هذا الأمر داخل المجموعة المراد تعيينها كإدارة.');
    await Bot.findByIdAndUpdate(botData._id, { adminGroupId: ctx.chat.id });
    ctx.reply('✅ تم تعيين هذه المجموعة كمجموعة إدارة.');
  });

  bot.command('set_reception', async (ctx) => {
    if (ctx.from.id !== botData.ownerId) return;
    if (ctx.chat.type === 'private') return ctx.reply('يجب إرسال هذا الأمر داخل المجموعة المراد تعيينها كاستقبال.');
    await Bot.findByIdAndUpdate(botData._id, { receptionGroupId: ctx.chat.id });
    ctx.reply('✅ تم تعيين هذه المجموعة كمجموعة استقبال لطلبات القنوات.');
  });

  // استقبال القنوات في مجموعة الاستقبال
  bot.on('text', async (ctx, next) => {
    if (ctx.chat.id === botData.receptionGroupId && (ctx.message.text.includes('t.me/') || ctx.message.text.startsWith('@'))) {
      const text = ctx.message.text;
      const username = text.split('t.me/')[1] || text.replace('@', '');
      
      try {
        const chat = await bot.telegram.getChat('@' + username.split('/')[0]);
        if (chat.type !== 'channel') return ctx.reply('❌ هذا الرابط ليس لقناة.');

        const member = await bot.telegram.getChatMember(chat.id, (await bot.telegram.getMe()).id);
        if (member.status !== 'administrator') {
          return ctx.reply('❌ يجب رفع البوت كمسؤول في القناة أولاً ليتم قبولها.');
        }

        const existing = await Channel.findOne({ botId: botData._id, channelId: chat.id });
        if (existing) return ctx.reply('⚠️ هذه القناة مضافة بالفعل.');

        await Channel.create({
          botId: botData._id,
          ownerId: ctx.from.id,
          channelId: chat.id,
          title: (chat as any).title,
          inviteLink: (chat as any).invite_link || `https://t.me/${username}`,
          isApproved: true // يتم قبولها تلقائياً إذا كان البوت مسؤولاً
        });

        ctx.reply(`✅ تم إضافة القناة بنجاح:\nالاسم: ${(chat as any).title}\nسيتم إضافتها للقائمة في النشر القادم.`);
      } catch (e) {
        ctx.reply('❌ تعذر الوصول للقناة. تأكد من صحة الرابط ومن وجود البوت فيها كمسؤول.');
      }
    }
    return next();
  });

  // عرض قنوات المستخدم في مجموعة الاستقبال
  bot.command('my_channels', async (ctx) => {
    if (ctx.chat.id !== botData.receptionGroupId) return;
    const channels = await Channel.find({ botId: botData._id, ownerId: ctx.from.id });
    if (channels.length === 0) return ctx.reply('❌ ليس لديك قنوات مضافة في هذا البوت.');

    let msg = '📋 قنواتك المضافة:\n\n';
    channels.forEach((ch, i) => {
      msg += `${i + 1}. ${ch.title} (${ch.isApproved ? '✅ معتمدة' : '⏳ قيد المراجعة'})\n`;
    });
    ctx.reply(msg);
  });

  // معاينة القائمة في مجموعة الإدارة
  bot.command('preview', async (ctx) => {
    const isAdmin = ctx.from.id === botData.ownerId || ctx.chat.id === botData.adminGroupId;
    if (!isAdmin) return;

    const channels = await Channel.find({ botId: botData._id, isApproved: true });
    if (channels.length === 0) return ctx.reply('❌ لا توجد قنوات معتمدة.');

    const buttons = channels.map(ch => [Markup.button.url(ch.title, ch.inviteLink || `https://t.me/${ch.channelId}`)]);
    ctx.reply('👀 معاينة القائمة:', Markup.inlineKeyboard(buttons));
  });

  // نشر القائمة
  bot.command('publish', async (ctx) => {
    const isAdmin = ctx.from.id === botData.ownerId || ctx.chat.id === botData.adminGroupId;
    if (!isAdmin) return;

    const channels = await Channel.find({ botId: botData._id, isApproved: true });
    if (channels.length === 0) return ctx.reply('❌ لا توجد قنوات للنشر.');

    const buttons = channels.map(ch => [Markup.button.url(ch.title, ch.inviteLink || `https://t.me/${ch.channelId}`)]);
    const keyboard = Markup.inlineKeyboard(buttons);

    let successCount = 0;
    for (const ch of channels) {
      try {
        const sent = await bot.telegram.sendMessage(ch.channelId, '📢 قائمة القنوات المشاركة:', keyboard);
        await Channel.findByIdAndUpdate(ch._id, { lastMessageId: sent.message_id });
        successCount++;
      } catch (e) {
        console.error(`Failed to post in ${ch.channelId}`);
      }
    }
    ctx.reply(`✅ تم النشر بنجاح في ${successCount} قناة.`);
  });

  // حذف القائمة
  bot.command('delete', async (ctx) => {
    const isAdmin = ctx.from.id === botData.ownerId || ctx.chat.id === botData.adminGroupId;
    if (!isAdmin) return;

    const channels = await Channel.find({ botId: botData._id, lastMessageId: { $exists: true } });
    let deleteCount = 0;

    for (const ch of channels) {
      try {
        if (ch.lastMessageId) {
          await bot.telegram.deleteMessage(ch.channelId, ch.lastMessageId);
          await Channel.findByIdAndUpdate(ch._id, { $unset: { lastMessageId: "" } });
          deleteCount++;
        }
      } catch (e) {
        console.error(`Failed to delete in ${ch.channelId}`);
      }
    }
    ctx.reply(`🗑 تم حذف القائمة من ${deleteCount} قناة.`);
  });

  // تحديث بيانات القنوات
  bot.command('update_info', async (ctx) => {
    const isAdmin = ctx.from.id === botData.ownerId || ctx.chat.id === botData.adminGroupId;
    if (!isAdmin) return;

    const channels = await Channel.find({ botId: botData._id });
    let updateCount = 0;

    for (const ch of channels) {
      try {
        const chat = await bot.telegram.getChat(ch.channelId);
        await Channel.findByIdAndUpdate(ch._id, {
          title: (chat as any).title,
          inviteLink: (chat as any).invite_link || ch.inviteLink
        });
        updateCount++;
      } catch (e) {
        console.error(`Failed to update ${ch.channelId}`);
      }
    }
    ctx.reply(`🔄 تم تحديث بيانات ${updateCount} قناة.`);
  });
};


