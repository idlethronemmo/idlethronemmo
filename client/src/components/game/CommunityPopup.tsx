import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { DiscordLogo, Heart, Star, Crown, Sparkle, ArrowSquareOut } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/useMobile";
import { useLanguage } from "@/context/LanguageContext";
import { RetryImage } from "@/components/ui/retry-image";
import type { Language } from "@/lib/i18n";

const COMMUNITY_TEXTS: Record<string, Record<Language, string>> = {
  title: { en: "Join Our Community", tr: "Topluluğumuza Katıl", ru: "Присоединяйтесь к сообществу", ar: "انضم إلى مجتمعنا", fr: "Rejoignez notre communauté", es: "Únete a nuestra comunidad", zh: "加入我们的社区", hi: "हमारे समुदाय में शामिल हों" },
  subtitle: {
    en: "IdleThrone is built together with its community. Your ideas, feedback, and support shape the future of the game. Every voice matters!",
    tr: "IdleThrone, topluluğuyla birlikte inşa ediliyor. Fikirleriniz, geri bildirimleriniz ve desteğiniz oyunun geleceğini şekillendiriyor. Her ses önemli!",
    ru: "IdleThrone создаётся вместе с сообществом. Ваши идеи, отзывы и поддержка формируют будущее игры. Каждый голос важен!",
    ar: "IdleThrone يُبنى مع مجتمعه. أفكارك وملاحظاتك ودعمك تشكل مستقبل اللعبة. كل صوت مهم!",
    fr: "IdleThrone est construit avec sa communauté. Vos idées, retours et soutien façonnent l'avenir du jeu. Chaque voix compte !",
    es: "IdleThrone se construye junto con su comunidad. Tus ideas, comentarios y apoyo dan forma al futuro del juego. ¡Cada voz importa!",
    zh: "IdleThrone与社区一起构建。您的想法、反馈和支持塑造着游戏的未来。每一个声音都很重要！",
    hi: "IdleThrone अपने समुदाय के साथ मिलकर बनाया जा रहा है। आपके विचार, फीडबैक और समर्थन गेम के भविष्य को आकार देते हैं। हर आवाज़ मायने रखती है!"
  },
  discordTitle: { en: "Discord Community", tr: "Discord Topluluğu", ru: "Сообщество Discord", ar: "مجتمع Discord", fr: "Communauté Discord", es: "Comunidad Discord", zh: "Discord 社区", hi: "Discord समुदाय" },
  discordDesc: {
    en: "Connect with fellow players, share strategies, report bugs, and get the latest news. Alpha Tester V1 badge holders get exclusive channel access!",
    tr: "Diğer oyuncularla bağlantı kur, stratejiler paylaş, hataları bildir ve en son haberleri al. Alfa Test V1 rozet sahipleri özel kanallara erişebilir!",
    ru: "Общайтесь с другими игроками, делитесь стратегиями, сообщайте об ошибках и получайте свежие новости. Обладатели значка Альфа-тестер V1 получают доступ к эксклюзивным каналам!",
    ar: "تواصل مع اللاعبين الآخرين، شارك الاستراتيجيات، أبلغ عن الأخطاء، واحصل على آخر الأخبار. حاملو شارة مختبر ألفا V1 يحصلون على وصول حصري!",
    fr: "Connectez-vous avec d'autres joueurs, partagez des stratégies, signalez des bugs et obtenez les dernières nouvelles. Les détenteurs du badge Alpha Testeur V1 ont accès à des canaux exclusifs !",
    es: "Conéctate con otros jugadores, comparte estrategias, reporta bugs y obtén las últimas noticias. ¡Los poseedores del badge Alpha Tester V1 obtienen acceso a canales exclusivos!",
    zh: "与其他玩家交流，分享策略，报告Bug，获取最新消息。内测玩家V1徽章持有者可以访问独家频道！",
    hi: "साथी खिलाड़ियों से जुड़ें, रणनीतियां साझा करें, बग रिपोर्ट करें, और नवीनतम समाचार प्राप्त करें। अल्फा टेस्टर V1 बैज धारकों को विशेष चैनल एक्सेस मिलता है!"
  },
  discordBtn: { en: "Join Discord", tr: "Discord'a Katıl", ru: "Войти в Discord", ar: "انضم إلى Discord", fr: "Rejoindre Discord", es: "Unirse a Discord", zh: "加入 Discord", hi: "Discord में शामिल हों" },
  donateTitle: { en: "Support Development", tr: "Geliştirmeyi Destekle", ru: "Поддержать разработку", ar: "ادعم التطوير", fr: "Soutenir le développement", es: "Apoyar el desarrollo", zh: "支持开发", hi: "विकास का समर्थन करें" },
  donateDesc: {
    en: "Help keep IdleThrone alive and growing! Supporters receive the exclusive Alpha Upholder badge with access to unique cosmetics coming soon.",
    tr: "IdleThrone'un yaşamasına ve büyümesine yardımcı ol! Destekçiler, yakında gelecek benzersiz kozmetiklere erişim sağlayan özel Alfa Destekçisi rozetini alır.",
    ru: "Помогите IdleThrone жить и развиваться! Спонсоры получают эксклюзивный значок Альфа-покровитель с доступом к уникальной косметике, которая скоро появится.",
    ar: "ساعد IdleThrone على البقاء والنمو! يحصل الداعمون على شارة داعم ألفا الحصرية مع الوصول إلى مستحضرات تجميل فريدة قادمة قريباً.",
    fr: "Aidez IdleThrone à vivre et grandir ! Les supporters reçoivent le badge exclusif Bienfaiteur Alpha avec accès à des cosmétiques uniques à venir.",
    es: "¡Ayuda a que IdleThrone siga vivo y creciendo! Los supporters reciben el badge exclusivo Benefactor Alfa con acceso a cosméticos únicos próximamente.",
    zh: "帮助IdleThrone持续发展！支持者将获得独家内测赞助者徽章，可解锁即将推出的独特外观。",
    hi: "IdleThrone को जीवित और बढ़ता रखने में मदद करें! समर्थकों को विशेष अल्फा सहायक बैज मिलता है जिसमें जल्द आने वाले अनोखे कॉस्मेटिक्स तक पहुंच शामिल है।"
  },
  donateBtn: { en: "Support Us", tr: "Bizi Destekle", ru: "Поддержать", ar: "ادعمنا", fr: "Nous soutenir", es: "Apóyanos", zh: "支持我们", hi: "हमारा समर्थन करें" },
  itchTitle: { en: "Rate on Itch.io", tr: "Itch.io'da Değerlendir", ru: "Оценить на Itch.io", ar: "قيّم على Itch.io", fr: "Noter sur Itch.io", es: "Valorar en Itch.io", zh: "在 Itch.io 上评分", hi: "Itch.io पर रेट करें" },
  itchDesc: {
    en: "Help more players discover IdleThrone by rating it on itch.io! Raters receive the exclusive Itch.io Supporter badge with future cosmetic rewards.",
    tr: "Itch.io'da değerlendirerek daha fazla oyuncunun IdleThrone'u keşfetmesine yardımcı ol! Değerlendirenler, gelecekteki kozmetik ödüllerle birlikte özel Itch.io Destekçisi rozetini alır.",
    ru: "Помогите большему количеству игроков найти IdleThrone, оценив её на itch.io! Оценившие получают эксклюзивный значок Поддержавший на Itch.io с будущими косметическими наградами.",
    ar: "ساعد المزيد من اللاعبين على اكتشاف IdleThrone بتقييمه على itch.io! المقيّمون يحصلون على شارة داعم Itch.io الحصرية مع مكافآت تجميلية مستقبلية.",
    fr: "Aidez plus de joueurs à découvrir IdleThrone en le notant sur itch.io ! Les évaluateurs reçoivent le badge exclusif Supporter Itch.io avec des récompenses cosmétiques futures.",
    es: "¡Ayuda a más jugadores a descubrir IdleThrone valorándolo en itch.io! Los valoradores reciben el badge exclusivo Supporter Itch.io con recompensas cosméticas futuras.",
    zh: "通过在itch.io上评分，帮助更多玩家发现IdleThrone！评分者将获得独家Itch.io支持者徽章，并享有未来的外观奖励。",
    hi: "itch.io पर रेट करके अधिक खिलाड़ियों को IdleThrone खोजने में मदद करें! रेट करने वालों को भविष्य के कॉस्मेटिक पुरस्कारों के साथ विशेष Itch.io समर्थक बैज मिलता है।"
  },
  itchBtn: { en: "Rate on Itch.io", tr: "Itch.io'da Değerlendir", ru: "Оценить на Itch.io", ar: "قيّم على Itch.io", fr: "Noter sur Itch.io", es: "Valorar en Itch.io", zh: "在 Itch.io 上评分", hi: "Itch.io पर रेट करें" },
  cosmeticNote: {
    en: "All badge holders will receive access to exclusive cosmetics coming in future updates!",
    tr: "Tüm rozet sahipleri, gelecek güncellemelerde özel kozmetiklere erişim kazanacak!",
    ru: "Все обладатели значков получат доступ к эксклюзивной косметике в будущих обновлениях!",
    ar: "جميع حاملي الشارات سيحصلون على مستحضرات تجميل حصرية في التحديثات القادمة!",
    fr: "Tous les détenteurs de badges recevront des cosmétiques exclusifs dans les futures mises à jour !",
    es: "¡Todos los poseedores de badges recibirán cosméticos exclusivos en futuras actualizaciones!",
    zh: "所有徽章持有者将在未来更新中获得独家外观！",
    hi: "सभी बैज धारकों को भविष्य के अपडेट में आने वाले विशेष कॉस्मेटिक्स मिलेंगे!"
  },
  closeBtn: { en: "Got it!", tr: "Anladım!", ru: "Понятно!", ar: "فهمت!", fr: "Compris !", es: "¡Entendido!", zh: "知道了！", hi: "समझ गया!" },
};

function txt(key: string, lang: Language): string {
  return COMMUNITY_TEXTS[key]?.[lang] || COMMUNITY_TEXTS[key]?.en || key;
}

interface CommunityPopupProps {
  open: boolean;
  onClose: () => void;
}

export default function CommunityPopup({ open, onClose }: CommunityPopupProps) {
  const { language } = useLanguage();
  const { isMobile } = useMobile();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="w-auto max-w-none p-0 gap-0 rounded-xl border-2 border-violet-500/40 bg-gradient-to-b from-card/98 to-card/95 backdrop-blur-xl shadow-2xl shadow-violet-500/10"
        style={{
          width: isMobile ? '80vw' : '33vw',
          maxWidth: isMobile ? '80vw' : '33vw',
          maxHeight: isMobile ? '80vh' : '70vh',
        }}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <VisuallyHidden><DialogTitle>Community</DialogTitle></VisuallyHidden>

        <div className={cn("overflow-y-auto px-3 py-3 space-y-2", isMobile ? "max-h-[80vh]" : "max-h-[70vh]")}>
          <div className="text-center space-y-1">
            <div className="inline-flex items-center justify-center p-2 rounded-full bg-gradient-to-br from-violet-500/20 to-amber-500/20 border border-violet-500/30 mx-auto">
              <Crown className="w-6 h-6 text-amber-400" weight="fill" />
            </div>
            <h2 className="text-lg font-display font-bold bg-gradient-to-r from-violet-400 via-amber-400 to-violet-400 bg-clip-text text-transparent">
              {txt('title', language)}
            </h2>
            <p className="text-xs text-muted-foreground leading-snug px-1">
              {txt('subtitle', language)}
            </p>
          </div>

          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-2.5 space-y-2">
            <div className="flex items-start gap-2">
              <div className="p-1.5 rounded-md bg-indigo-500/20 border border-indigo-500/30 shrink-0 mt-0.5">
                <DiscordLogo className="w-4 h-4 text-indigo-400" weight="bold" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-bold text-indigo-300 text-sm leading-tight">{txt('discordTitle', language)}</h3>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{txt('discordDesc', language)}</p>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-display text-xs h-8"
              onClick={() => window.open('https://discord.gg/kwk6K4GJrr', '_blank')}
              data-testid="community-discord-btn"
            >
              <DiscordLogo className="w-3.5 h-3.5 mr-1.5" weight="bold" />
              {txt('discordBtn', language)}
              <ArrowSquareOut className="w-3 h-3 ml-1.5 opacity-60" />
            </Button>
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-2">
            <div className="flex items-start gap-2">
              <div className="p-1.5 rounded-md bg-amber-500/20 border border-amber-500/30 shrink-0 mt-0.5">
                <Heart className="w-4 h-4 text-amber-400" weight="fill" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-bold text-amber-300 text-sm leading-tight">{txt('donateTitle', language)}</h3>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{txt('donateDesc', language)}</p>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-display text-xs h-8"
              onClick={() => window.open('https://thronecreator.itch.io/idlethrone', '_blank')}
              data-testid="community-donate-btn"
            >
              <Heart className="w-3.5 h-3.5 mr-1.5" weight="fill" />
              {txt('donateBtn', language)}
              <ArrowSquareOut className="w-3 h-3 ml-1.5 opacity-60" />
            </Button>
          </div>

          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-2.5 space-y-2">
            <div className="flex items-start gap-2">
              <div className="p-1.5 rounded-md bg-cyan-500/20 border border-cyan-500/30 shrink-0 mt-0.5">
                <Star className="w-4 h-4 text-cyan-400" weight="fill" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-bold text-cyan-300 text-sm leading-tight">{txt('itchTitle', language)}</h3>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{txt('itchDesc', language)}</p>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-display text-xs h-8"
              onClick={() => window.open('https://thronecreator.itch.io/idlethrone', '_blank')}
              data-testid="community-itch-btn"
            >
              <Star className="w-3.5 h-3.5 mr-1.5" weight="fill" />
              {txt('itchBtn', language)}
              <ArrowSquareOut className="w-3 h-3 ml-1.5 opacity-60" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-gradient-to-r from-violet-500/10 via-amber-500/10 to-cyan-500/10 border border-violet-500/20">
            <Sparkle className="w-3.5 h-3.5 text-amber-400 shrink-0" weight="fill" />
            <p className="text-[10px] text-amber-300/80 font-medium leading-snug">
              {txt('cosmeticNote', language)}
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full border-violet-500/30 text-violet-300 hover:bg-violet-500/10 font-display text-xs h-8"
            onClick={onClose}
            data-testid="community-close-btn"
          >
            {txt('closeBtn', language)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
