import { Context, Telegraf, Markup } from 'telegraf';
import Bot, { IBot } from '../models/Bot';
import Channel from '../models/Channel';

export const setupChildBot = (bot: Telegraf<Context>, botData: IBot) => {
  
  bot.start((ctx) => {
    if (ctx.from.id === botData.ownerId) {
      ctx.reply('مرحباً بك يا مالك البوت! 👑\n\nاستخدم الأوامر التالية:\n/set_admin - تعيين مجموعة الإدارة\n/set_reception - تعيين مجموعة الاستقبال\n/publish - نشر القائمة\n/delete - حذف القائمة');
    } else {
      ctx.reply('مرحباً بك! هذا البوت مخصص لإدارة إعلانات القنوات.');
    }
  });

  // تعيين مجموعة الإدارة
  bot.command('set_admin', async (ctx) => {
    if (ctx.from.id !== botData.ownerId) return;
    if (ctx.chat.type === 'private') return ctx.reply('يجب إرسال هذا الأمر داخل المجموعة المراد تعيينها كإدارة.');
    
    await Bot.findByIdAndUpdate(botData._id, { adminGroupId: ctx.chat.id });
    ctx.reply('✅ تم تعيين هذه المجموعة كمجموعة إدارة.');
  });

  // تعيين مجموعة الاستقبال
  bot.command('set_reception', async (ctx) => {
    if (ctx.from.id !== botData.ownerId) return;
    if (ctx.chat.type === 'private') return ctx.reply('يجب إرسال هذا الأمر داخل المجموعة المراد تعيينها كاستقبال.');
    
    await Bot.findByIdAndUpdate(botData._id, { receptionGroupId: ctx.chat.id });
    ctx.reply('✅ تم تعيين هذه المجموعة كمجموعة استقبال لطلبات القنوات.');
  });

  // استقبال روابط القنوات في مجموعة الاستقبال
  bot.on('text', async (ctx, next) => {
    if (ctx.chat.id === botData.receptionGroupId && ctx.message.text.includes('t.me/')) {
      const channelLink = ctx.message.text;
      // هنا يمكن إضافة منطق للتحقق من القناة وإضافتها لقاعدة البيانات
      // سنفترض أن المشرف سيقوم بإضافتها يدوياً أو عبر أمر
      ctx.reply('📥 تم استلام رابط القناة، سيتم مراجعته.');
    }
    return next();
  });

  // أمر النشر
  bot.command('publish', async (ctx) => {
    const isAdmin = ctx.from.id === botData.ownerId || ctx.chat.id === botData.adminGroupId;
    if (!isAdmin) return;

    const channels = await Channel.find({ botId: botData._id, isApproved: true });
    if (channels.length === 0) return ctx.reply('❌ لا توجد قنوات معتمدة للنشر.');

    const buttons = channels.map(ch => [Markup.button.url(ch.title, ch.inviteLink || `https://t.me/${ch.channelId}`)]);
    const keyboard = Markup.inlineKeyboard(buttons);

    // النشر في جميع القنوات
    for (const ch of channels) {
      try {
        await bot.telegram.sendMessage(ch.channelId, '📢 قائمة القنوات المشاركة:', keyboard);
      } catch (e) {
        console.error(`Failed to post in ${ch.channelId}`);
      }
    }
    ctx.reply('✅ تم نشر القائمة في جميع القنوات.');
  });

  // أمر الحذف
  bot.command('delete', async (ctx) => {
    const isAdmin = ctx.from.id === botData.ownerId || ctx.chat.id === botData.adminGroupId;
    if (!isAdmin) return;
    // منطق الحذف يتطلب تخزين message_id لكل رسالة تم نشرها
    ctx.reply('🔄 جاري حذف القائمة من القنوات...');
  });
};
