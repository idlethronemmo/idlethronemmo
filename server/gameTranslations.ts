type TranslationMap = Record<string, Record<string, string>>;

export const LANGUAGES = ['en', 'zh', 'hi', 'es', 'fr', 'ar', 'ru', 'tr'] as const;
export type GameLanguage = typeof LANGUAGES[number];

export const itemTranslations: TranslationMap = {
  "Bronze Sword": { en: "Bronze Sword", zh: "青铜剑", hi: "कांस्य तलवार", es: "Espada de Bronce", fr: "Épée de Bronze", ar: "سيف برونزي", ru: "Бронзовый меч", tr: "Bronz Kılıç" },
  "Bronze Dagger": { en: "Bronze Dagger", zh: "青铜匕首", hi: "कांस्य खंजर", es: "Daga de Bronce", fr: "Dague de Bronze", ar: "خنجر برونزي", ru: "Бронзовый кинжал", tr: "Bronz Hançer" },
  "Bronze Helmet": { en: "Bronze Helmet", zh: "青铜头盔", hi: "कांस्य हेलमेट", es: "Casco de Bronce", fr: "Casque de Bronze", ar: "خوذة برونزية", ru: "Бронзовый шлем", tr: "Bronz Miğfer" },
  "Bronze Platebody": { en: "Bronze Platebody", zh: "青铜板甲", hi: "कांस्य कवच", es: "Coraza de Bronce", fr: "Plastron de Bronze", ar: "درع برونزي", ru: "Бронзовая кираса", tr: "Bronz Zırh" },
  "Bronze Platelegs": { en: "Bronze Platelegs", zh: "青铜腿甲", hi: "कांस्य पैर कवच", es: "Grebas de Bronce", fr: "Jambières de Bronze", ar: "واقي ساق برونزي", ru: "Бронзовые поножи", tr: "Bronz Bacak Zırhı" },
  "Bronze Boots": { en: "Bronze Boots", zh: "青铜靴子", hi: "कांस्य जूते", es: "Botas de Bronce", fr: "Bottes de Bronze", ar: "أحذية برونزية", ru: "Бронзовые сапоги", tr: "Bronz Çizmeler" },
  "Bronze Gloves": { en: "Bronze Gloves", zh: "青铜手套", hi: "कांस्य दस्ताने", es: "Guantes de Bronce", fr: "Gants de Bronze", ar: "قفازات برونزية", ru: "Бронзовые перчатки", tr: "Bronz Eldivenler" },
  "Bronze Buckler": { en: "Bronze Buckler", zh: "青铜小盾", hi: "कांस्य ढाल", es: "Rodela de Bronce", fr: "Bocle de Bronze", ar: "ترس برونزي", ru: "Бронзовый баклер", tr: "Bronz Kalkan" },
  "Bronze Shield": { en: "Bronze Shield", zh: "青铜盾牌", hi: "कांस्य ढाल", es: "Escudo de Bronce", fr: "Bouclier de Bronze", ar: "درع برونزي", ru: "Бронзовый щит", tr: "Bronz Kalkan" },
  "Bronze Amulet": { en: "Bronze Amulet", zh: "青铜护身符", hi: "कांस्य ताबीज", es: "Amuleto de Bronce", fr: "Amulette de Bronze", ar: "تميمة برونزية", ru: "Бронзовый амулет", tr: "Bronz Muska" },
  "Bronze Ring": { en: "Bronze Ring", zh: "青铜戒指", hi: "कांस्य अंगूठी", es: "Anillo de Bronce", fr: "Anneau de Bronze", ar: "خاتم برونزي", ru: "Бронзовое кольцо", tr: "Bronz Yüzük" },
  "Bronze Bar": { en: "Bronze Bar", zh: "青铜锭", hi: "कांस्य सिल्ली", es: "Lingote de Bronce", fr: "Lingot de Bronze", ar: "سبيكة برونزية", ru: "Бронзовый слиток", tr: "Bronz Külçe" },
  "Iron Sword": { en: "Iron Sword", zh: "铁剑", hi: "लोहे की तलवार", es: "Espada de Hierro", fr: "Épée de Fer", ar: "سيف حديدي", ru: "Железный меч", tr: "Demir Kılıç" },
  "Iron Dagger": { en: "Iron Dagger", zh: "铁匕首", hi: "लोहे का खंजर", es: "Daga de Hierro", fr: "Dague de Fer", ar: "خنجر حديدي", ru: "Железный кинжал", tr: "Demir Hançer" },
  "Iron Helmet": { en: "Iron Helmet", zh: "铁头盔", hi: "लोहे का हेलमेट", es: "Casco de Hierro", fr: "Casque de Fer", ar: "خوذة حديدية", ru: "Железный шлем", tr: "Demir Miğfer" },
  "Iron Platebody": { en: "Iron Platebody", zh: "铁板甲", hi: "लोहे का कवच", es: "Coraza de Hierro", fr: "Plastron de Fer", ar: "درع حديدي", ru: "Железная кираса", tr: "Demir Zırh" },
  "Iron Platelegs": { en: "Iron Platelegs", zh: "铁腿甲", hi: "लोहे का पैर कवच", es: "Grebas de Hierro", fr: "Jambières de Fer", ar: "واقي ساق حديدي", ru: "Железные поножи", tr: "Demir Bacak Zırhı" },
  "Iron Boots": { en: "Iron Boots", zh: "铁靴子", hi: "लोहे के जूते", es: "Botas de Hierro", fr: "Bottes de Fer", ar: "أحذية حديدية", ru: "Железные сапоги", tr: "Demir Çizmeler" },
  "Iron Gloves": { en: "Iron Gloves", zh: "铁手套", hi: "लोहे के दस्ताने", es: "Guantes de Hierro", fr: "Gants de Fer", ar: "قفازات حديدية", ru: "Железные перчатки", tr: "Demir Eldivenler" },
  "Iron Shield": { en: "Iron Shield", zh: "铁盾牌", hi: "लोहे की ढाल", es: "Escudo de Hierro", fr: "Bouclier de Fer", ar: "درع حديدي", ru: "Железный щит", tr: "Demir Kalkan" },
  "Iron Bar": { en: "Iron Bar", zh: "铁锭", hi: "लोहे की सिल्ली", es: "Lingote de Hierro", fr: "Lingot de Fer", ar: "سبيكة حديدية", ru: "Железный слиток", tr: "Demir Külçe" },
  "Iron Ore": { en: "Iron Ore", zh: "铁矿石", hi: "लोहा अयस्क", es: "Mineral de Hierro", fr: "Minerai de Fer", ar: "خام الحديد", ru: "Железная руда", tr: "Demir Cevheri" },
  "Steel Sword": { en: "Steel Sword", zh: "钢剑", hi: "स्टील तलवार", es: "Espada de Acero", fr: "Épée d'Acier", ar: "سيف فولاذي", ru: "Стальной меч", tr: "Çelik Kılıç" },
  "Steel Helmet": { en: "Steel Helmet", zh: "钢头盔", hi: "स्टील हेलमेट", es: "Casco de Acero", fr: "Casque d'Acier", ar: "خوذة فولاذية", ru: "Стальной шлем", tr: "Çelik Miğfer" },
  "Steel Platebody": { en: "Steel Platebody", zh: "钢板甲", hi: "स्टील कवच", es: "Coraza de Acero", fr: "Plastron d'Acier", ar: "درع فولاذي", ru: "Стальная кираса", tr: "Çelik Zırh" },
  "Steel Platelegs": { en: "Steel Platelegs", zh: "钢腿甲", hi: "स्टील पैर कवच", es: "Grebas de Acero", fr: "Jambières d'Acier", ar: "واقي ساق فولاذي", ru: "Стальные поножи", tr: "Çelik Bacak Zırhı" },
  "Steel Bar": { en: "Steel Bar", zh: "钢锭", hi: "स्टील सिल्ली", es: "Lingote de Acero", fr: "Lingot d'Acier", ar: "سبيكة فولاذية", ru: "Стальной слиток", tr: "Çelik Külçe" },
  "Mithril Sword": { en: "Mithril Sword", zh: "秘银剑", hi: "मिथ्रिल तलवार", es: "Espada de Mithril", fr: "Épée de Mithril", ar: "سيف ميثريل", ru: "Мифриловый меч", tr: "Mithril Kılıç" },
  "Mithril Helmet": { en: "Mithril Helmet", zh: "秘银头盔", hi: "मिथ्रिल हेलमेट", es: "Casco de Mithril", fr: "Casque de Mithril", ar: "خوذة ميثريل", ru: "Мифриловый шлем", tr: "Mithril Miğfer" },
  "Mithril Platebody": { en: "Mithril Platebody", zh: "秘银板甲", hi: "मिथ्रिल कवच", es: "Coraza de Mithril", fr: "Plastron de Mithril", ar: "درع ميثريل", ru: "Мифриловая кираса", tr: "Mithril Zırh" },
  "Mithril Platelegs": { en: "Mithril Platelegs", zh: "秘银腿甲", hi: "मिथ्रिल पैर कवच", es: "Grebas de Mithril", fr: "Jambières de Mithril", ar: "واقي ساق ميثريل", ru: "Мифриловые поножи", tr: "Mithril Bacak Zırhı" },
  "Mithril Bar": { en: "Mithril Bar", zh: "秘银锭", hi: "मिथ्रिल सिल्ली", es: "Lingote de Mithril", fr: "Lingot de Mithril", ar: "سبيكة ميثريل", ru: "Мифриловый слиток", tr: "Mithril Külçe" },
  "Mithril Ore": { en: "Mithril Ore", zh: "秘银矿石", hi: "मिथ्रिल अयस्क", es: "Mineral de Mithril", fr: "Minerai de Mithril", ar: "خام ميثريل", ru: "Мифриловая руда", tr: "Mithril Cevheri" },
  "Adamant Sword": { en: "Adamant Sword", zh: "精金剑", hi: "एडामेंट तलवार", es: "Espada de Adamantio", fr: "Épée d'Adamante", ar: "سيف أدامنت", ru: "Адамантовый меч", tr: "Adamant Kılıç" },
  "Adamant Helmet": { en: "Adamant Helmet", zh: "精金头盔", hi: "एडामेंट हेलमेट", es: "Casco de Adamantio", fr: "Casque d'Adamante", ar: "خوذة أدامنت", ru: "Адамантовый шлем", tr: "Adamant Miğfer" },
  "Adamant Platebody": { en: "Adamant Platebody", zh: "精金板甲", hi: "एडामेंट कवच", es: "Coraza de Adamantio", fr: "Plastron d'Adamante", ar: "درع أدامنت", ru: "Адамантовая кираса", tr: "Adamant Zırh" },
  "Adamant Platelegs": { en: "Adamant Platelegs", zh: "精金腿甲", hi: "एडामेंट पैर कवच", es: "Grebas de Adamantio", fr: "Jambières d'Adamante", ar: "واقي ساق أدامنت", ru: "Адамантовые поножи", tr: "Adamant Bacak Zırhı" },
  "Adamant Bar": { en: "Adamant Bar", zh: "精金锭", hi: "एडामेंट सिल्ली", es: "Lingote de Adamantio", fr: "Lingot d'Adamante", ar: "سبيكة أدامنت", ru: "Адамантовый слиток", tr: "Adamant Külçe" },
  "Adamant Ore": { en: "Adamant Ore", zh: "精金矿石", hi: "एडामेंट अयस्क", es: "Mineral de Adamantio", fr: "Minerai d'Adamante", ar: "خام أدامنت", ru: "Адамантовая руда", tr: "Adamant Cevheri" },
  "Rune Sword": { en: "Rune Sword", zh: "符文剑", hi: "रूण तलवार", es: "Espada Rúnica", fr: "Épée Runique", ar: "سيف رونية", ru: "Рунический меч", tr: "Runik Kılıç" },
  "Rune Helmet": { en: "Rune Helmet", zh: "符文头盔", hi: "रूण हेलमेट", es: "Casco Rúnico", fr: "Casque Runique", ar: "خوذة رونية", ru: "Рунический шлем", tr: "Runik Miğfer" },
  "Rune Platebody": { en: "Rune Platebody", zh: "符文板甲", hi: "रूण कवच", es: "Coraza Rúnica", fr: "Plastron Runique", ar: "درع رونية", ru: "Руническая кираса", tr: "Runik Zırh" },
  "Rune Platelegs": { en: "Rune Platelegs", zh: "符文腿甲", hi: "रूण पैर कवच", es: "Grebas Rúnicas", fr: "Jambières Runiques", ar: "واقي ساق رونية", ru: "Рунические поножи", tr: "Runik Bacak Zırhı" },
  "Rune Bar": { en: "Rune Bar", zh: "符文锭", hi: "रूण सिल्ली", es: "Lingote Rúnico", fr: "Lingot Runique", ar: "سبيكة رونية", ru: "Рунический слиток", tr: "Runik Külçe" },
  "Rune Ore": { en: "Rune Ore", zh: "符文矿石", hi: "रूण अयस्क", es: "Mineral Rúnico", fr: "Minerai Runique", ar: "خام رونية", ru: "Руническая руда", tr: "Runik Cevher" },
  "Dragon Sword": { en: "Dragon Sword", zh: "龙剑", hi: "ड्रैगन तलवार", es: "Espada de Dragón", fr: "Épée de Dragon", ar: "سيف التنين", ru: "Драконий меч", tr: "Ejder Kılıcı" },
  "Dragon Helmet": { en: "Dragon Helmet", zh: "龙头盔", hi: "ड्रैगन हेलमेट", es: "Casco de Dragón", fr: "Casque de Dragon", ar: "خوذة التنين", ru: "Драконий шлем", tr: "Ejder Miğferi" },
  "Dragon Platebody": { en: "Dragon Platebody", zh: "龙板甲", hi: "ड्रैगन कवच", es: "Coraza de Dragón", fr: "Plastron de Dragon", ar: "درع التنين", ru: "Драконья кираса", tr: "Ejder Zırhı" },
  "Dragon Platelegs": { en: "Dragon Platelegs", zh: "龙腿甲", hi: "ड्रैगन पैर कवच", es: "Grebas de Dragón", fr: "Jambières de Dragon", ar: "واقي ساق التنين", ru: "Драконьи поножи", tr: "Ejder Bacak Zırhı" },
  "Copper Ore": { en: "Copper Ore", zh: "铜矿石", hi: "तांबा अयस्क", es: "Mineral de Cobre", fr: "Minerai de Cuivre", ar: "خام النحاس", ru: "Медная руда", tr: "Bakır Cevheri" },
  "Tin Ore": { en: "Tin Ore", zh: "锡矿石", hi: "टिन अयस्क", es: "Mineral de Estaño", fr: "Minerai d'Étain", ar: "خام القصدير", ru: "Оловянная руда", tr: "Kalay Cevheri" },
  "Coal": { en: "Coal", zh: "煤炭", hi: "कोयला", es: "Carbón", fr: "Charbon", ar: "فحم", ru: "Уголь", tr: "Kömür" },
  "Gold Ore": { en: "Gold Ore", zh: "金矿石", hi: "सोना अयस्क", es: "Mineral de Oro", fr: "Minerai d'Or", ar: "خام الذهب", ru: "Золотая руда", tr: "Altın Cevheri" },
  "Silver Ore": { en: "Silver Ore", zh: "银矿石", hi: "चांदी अयस्क", es: "Mineral de Plata", fr: "Minerai d'Argent", ar: "خام الفضة", ru: "Серебряная руда", tr: "Gümüş Cevheri" },
  "Normal Tree": { en: "Normal Tree", zh: "普通树", hi: "सामान्य पेड़", es: "Árbol Normal", fr: "Arbre Normal", ar: "شجرة عادية", ru: "Обычное дерево", tr: "Normal Ağaç" },
  "Oak Tree": { en: "Oak Tree", zh: "橡树", hi: "ओक का पेड़", es: "Roble", fr: "Chêne", ar: "شجرة بلوط", ru: "Дуб", tr: "Meşe Ağacı" },
  "Willow Tree": { en: "Willow Tree", zh: "柳树", hi: "विलो का पेड़", es: "Sauce", fr: "Saule", ar: "شجرة صفصاف", ru: "Ива", tr: "Söğüt Ağacı" },
  "Maple Tree": { en: "Maple Tree", zh: "枫树", hi: "मेपल का पेड़", es: "Arce", fr: "Érable", ar: "شجرة قيقب", ru: "Клён", tr: "Akçaağaç" },
  "Yew Tree": { en: "Yew Tree", zh: "紫杉", hi: "यू का पेड़", es: "Tejo", fr: "If", ar: "شجرة طقسوس", ru: "Тис", tr: "Porsuk Ağacı" },
  "Magic Tree": { en: "Magic Tree", zh: "魔法树", hi: "जादुई पेड़", es: "Árbol Mágico", fr: "Arbre Magique", ar: "شجرة سحرية", ru: "Магическое дерево", tr: "Büyülü Ağaç" },
  "Raw Shrimp": { en: "Raw Shrimp", zh: "生虾", hi: "कच्ची झींगा", es: "Camarón Crudo", fr: "Crevette Crue", ar: "روبيان نيء", ru: "Сырые креветки", tr: "Çiğ Karides" },
  "Raw Sardine": { en: "Raw Sardine", zh: "生沙丁鱼", hi: "कच्ची सार्डिन", es: "Sardina Cruda", fr: "Sardine Crue", ar: "سردين نيء", ru: "Сырая сардина", tr: "Çiğ Sardalya" },
  "Raw Herring": { en: "Raw Herring", zh: "生鲱鱼", hi: "कच्ची हेरिंग", es: "Arenque Crudo", fr: "Hareng Cru", ar: "رنجة نيئة", ru: "Сырая сельдь", tr: "Çiğ Ringa" },
  "Raw Trout": { en: "Raw Trout", zh: "生鳟鱼", hi: "कच्ची ट्राउट", es: "Trucha Cruda", fr: "Truite Crue", ar: "سلمون مرقط نيء", ru: "Сырая форель", tr: "Çiğ Alabalık" },
  "Raw Salmon": { en: "Raw Salmon", zh: "生鲑鱼", hi: "कच्ची सैल्मन", es: "Salmón Crudo", fr: "Saumon Cru", ar: "سلمون نيء", ru: "Сырой лосось", tr: "Çiğ Somon" },
  "Raw Tuna": { en: "Raw Tuna", zh: "生金枪鱼", hi: "कच्ची टूना", es: "Atún Crudo", fr: "Thon Cru", ar: "تونة نيئة", ru: "Сырой тунец", tr: "Çiğ Ton Balığı" },
  "Raw Lobster": { en: "Raw Lobster", zh: "生龙虾", hi: "कच्चा लॉबस्टर", es: "Langosta Cruda", fr: "Homard Cru", ar: "كركند نيء", ru: "Сырой омар", tr: "Çiğ Istakoz" },
  "Raw Swordfish": { en: "Raw Swordfish", zh: "生剑鱼", hi: "कच्ची स्वोर्डफिश", es: "Pez Espada Crudo", fr: "Espadon Cru", ar: "سمكة سيف نيئة", ru: "Сырая рыба-меч", tr: "Çiğ Kılıç Balığı" },
  "Raw Shark": { en: "Raw Shark", zh: "生鲨鱼", hi: "कच्ची शार्क", es: "Tiburón Crudo", fr: "Requin Cru", ar: "قرش نيء", ru: "Сырая акула", tr: "Çiğ Köpekbalığı" },
  "Cooked Shrimp": { en: "Cooked Shrimp", zh: "熟虾", hi: "पकी झींगा", es: "Camarón Cocido", fr: "Crevette Cuite", ar: "روبيان مطبوخ", ru: "Приготовленные креветки", tr: "Pişmiş Karides" },
  "Cooked Sardine": { en: "Cooked Sardine", zh: "熟沙丁鱼", hi: "पकी सार्डिन", es: "Sardina Cocida", fr: "Sardine Cuite", ar: "سردين مطبوخ", ru: "Приготовленная сардина", tr: "Pişmiş Sardalya" },
  "Cooked Herring": { en: "Cooked Herring", zh: "熟鲱鱼", hi: "पकी हेरिंग", es: "Arenque Cocido", fr: "Hareng Cuit", ar: "رنجة مطبوخة", ru: "Приготовленная сельдь", tr: "Pişmiş Ringa" },
  "Cooked Trout": { en: "Cooked Trout", zh: "熟鳟鱼", hi: "पकी ट्राउट", es: "Trucha Cocida", fr: "Truite Cuite", ar: "سلمون مرقط مطبوخ", ru: "Приготовленная форель", tr: "Pişmiş Alabalık" },
  "Cooked Salmon": { en: "Cooked Salmon", zh: "熟鲑鱼", hi: "पकी सैल्मन", es: "Salmón Cocido", fr: "Saumon Cuit", ar: "سلمون مطبوخ", ru: "Приготовленный лосось", tr: "Pişmiş Somon" },
  "Cooked Tuna": { en: "Cooked Tuna", zh: "熟金枪鱼", hi: "पकी टूना", es: "Atún Cocido", fr: "Thon Cuit", ar: "تونة مطبوخة", ru: "Приготовленный тунец", tr: "Pişmiş Ton Balığı" },
  "Cooked Lobster": { en: "Cooked Lobster", zh: "熟龙虾", hi: "पका लॉबस्टर", es: "Langosta Cocida", fr: "Homard Cuit", ar: "كركند مطبوخ", ru: "Приготовленный омар", tr: "Pişmiş Istakoz" },
  "Cooked Swordfish": { en: "Cooked Swordfish", zh: "熟剑鱼", hi: "पकी स्वोर्डफिश", es: "Pez Espada Cocido", fr: "Espadon Cuit", ar: "سمكة سيف مطبوخة", ru: "Приготовленная рыба-меч", tr: "Pişmiş Kılıç Balığı" },
  "Cooked Shark": { en: "Cooked Shark", zh: "熟鲨鱼", hi: "पकी शार्क", es: "Tiburón Cocido", fr: "Requin Cuit", ar: "قرش مطبوخ", ru: "Приготовленная акула", tr: "Pişmiş Köpekbalığı" },
  "Bones": { en: "Bones", zh: "骨头", hi: "हड्डियां", es: "Huesos", fr: "Os", ar: "عظام", ru: "Кости", tr: "Kemikler" },
  "Feather": { en: "Feather", zh: "羽毛", hi: "पंख", es: "Pluma", fr: "Plume", ar: "ريشة", ru: "Перо", tr: "Tüy" },
  "Health Potion": { en: "Health Potion", zh: "生命药水", hi: "स्वास्थ्य औषधि", es: "Poción de Salud", fr: "Potion de Santé", ar: "جرعة صحة", ru: "Зелье здоровья", tr: "Sağlık İksiri" },
  "Strength Potion": { en: "Strength Potion", zh: "力量药水", hi: "शक्ति औषधि", es: "Poción de Fuerza", fr: "Potion de Force", ar: "جرعة قوة", ru: "Зелье силы", tr: "Güç İksiri" },
  "Defence Potion": { en: "Defence Potion", zh: "防御药水", hi: "रक्षा औषधि", es: "Poción de Defensa", fr: "Potion de Défense", ar: "جرعة دفاع", ru: "Зелье защиты", tr: "Savunma İksiri" },
  "Attack Potion": { en: "Attack Potion", zh: "攻击药水", hi: "आक्रमण औषधि", es: "Poción de Ataque", fr: "Potion d'Attaque", ar: "جرعة هجوم", ru: "Зелье атаки", tr: "Saldırı İksiri" },
};

export const monsterTranslations: TranslationMap = {
  "Tavuk": { en: "Chicken", zh: "鸡", hi: "मुर्गी", es: "Pollo", fr: "Poulet", ar: "دجاجة", ru: "Курица", tr: "Tavuk" },
  "Yaban Tavşanı": { en: "Wild Rabbit", zh: "野兔", hi: "जंगली खरगोश", es: "Conejo Salvaje", fr: "Lapin Sauvage", ar: "أرنب بري", ru: "Дикий кролик", tr: "Yaban Tavşanı" },
  "Goblin": { en: "Goblin", zh: "哥布林", hi: "गोबलिन", es: "Goblin", fr: "Gobelin", ar: "غوبلن", ru: "Гоблин", tr: "Goblin" },
  "Kurt": { en: "Wolf", zh: "狼", hi: "भेड़िया", es: "Lobo", fr: "Loup", ar: "ذئب", ru: "Волк", tr: "Kurt" },
  "İskelet": { en: "Skeleton", zh: "骷髅", hi: "कंकाल", es: "Esqueleto", fr: "Squelette", ar: "هيكل عظمي", ru: "Скелет", tr: "İskelet" },
  "Zombi": { en: "Zombie", zh: "僵尸", hi: "ज़ॉम्बी", es: "Zombi", fr: "Zombie", ar: "زومبي", ru: "Зомби", tr: "Zombi" },
  "Mağara Yarasası": { en: "Cave Bat", zh: "洞穴蝙蝠", hi: "गुफा चमगादड़", es: "Murciélago de Cueva", fr: "Chauve-souris de Caverne", ar: "خفاش الكهف", ru: "Пещерная летучая мышь", tr: "Mağara Yarasası" },
  "Orman Örümceği": { en: "Forest Spider", zh: "森林蜘蛛", hi: "जंगल की मकड़ी", es: "Araña del Bosque", fr: "Araignée de Forêt", ar: "عنكبوت الغابة", ru: "Лесной паук", tr: "Orman Örümceği" },
  "Haydut": { en: "Bandit", zh: "强盗", hi: "डाकू", es: "Bandido", fr: "Bandit", ar: "قاطع طريق", ru: "Бандит", tr: "Haydut" },
  "Ork Piyadesi": { en: "Orc Footsoldier", zh: "兽人步兵", hi: "ऑर्क पैदल सैनिक", es: "Soldado Orco", fr: "Fantassin Orque", ar: "مشاة أورك", ru: "Орк-пехотинец", tr: "Ork Piyadesi" },
  "Ork Savaşçısı": { en: "Orc Warrior", zh: "兽人战士", hi: "ऑर्क योद्धा", es: "Guerrero Orco", fr: "Guerrier Orque", ar: "محارب أورك", ru: "Орк-воин", tr: "Ork Savaşçısı" },
  "Dev Örümcek": { en: "Giant Spider", zh: "巨型蜘蛛", hi: "विशाल मकड़ी", es: "Araña Gigante", fr: "Araignée Géante", ar: "عنكبوت عملاق", ru: "Гигантский паук", tr: "Dev Örümcek" },
  "Mağara Trolü": { en: "Cave Troll", zh: "洞穴巨魔", hi: "गुफा ट्रोल", es: "Trol de Cueva", fr: "Troll des Cavernes", ar: "ترول الكهف", ru: "Пещерный тролль", tr: "Mağara Trolü" },
  "Kaya Golemi": { en: "Stone Golem", zh: "石头傀儡", hi: "पत्थर का गोलेम", es: "Gólem de Piedra", fr: "Golem de Pierre", ar: "غولم صخري", ru: "Каменный голем", tr: "Kaya Golemi" },
  "Mumya": { en: "Mummy", zh: "木乃伊", hi: "ममी", es: "Momia", fr: "Momie", ar: "مومياء", ru: "Мумия", tr: "Mumya" },
  "Cin": { en: "Djinn", zh: "精灵", hi: "जिन्न", es: "Genio", fr: "Djinn", ar: "جني", ru: "Джинн", tr: "Cin" },
  "Çöl Akrebi": { en: "Desert Scorpion", zh: "沙漠蝎子", hi: "रेगिस्तानी बिच्छू", es: "Escorpión del Desierto", fr: "Scorpion du Désert", ar: "عقرب الصحراء", ru: "Пустынный скорпион", tr: "Çöl Akrebi" },
  "Kum Elementi": { en: "Sand Elemental", zh: "沙元素", hi: "रेत तत्व", es: "Elemental de Arena", fr: "Élémental de Sable", ar: "عنصر الرمال", ru: "Песчаный элементаль", tr: "Kum Elementi" },
  "Maden Ustabaşı": { en: "Mine Foreman", zh: "矿工领班", hi: "खदान फोरमैन", es: "Capataz de Mina", fr: "Contremaître de Mine", ar: "رئيس عمال المنجم", ru: "Бригадир шахты", tr: "Maden Ustabaşı" },
  "Karanlık Şövalye": { en: "Dark Knight", zh: "黑暗骑士", hi: "अंधेरा शूरवीर", es: "Caballero Oscuro", fr: "Chevalier Noir", ar: "فارس الظلام", ru: "Тёмный рыцарь", tr: "Karanlık Şövalye" },
  "Gölge Avcısı": { en: "Shadow Hunter", zh: "暗影猎手", hi: "छाया शिकारी", es: "Cazador de Sombras", fr: "Chasseur d'Ombres", ar: "صياد الظلال", ru: "Охотник теней", tr: "Gölge Avcısı" },
  "Tepe Devi": { en: "Hill Giant", zh: "山丘巨人", hi: "पहाड़ी दैत्य", es: "Gigante de Colina", fr: "Géant des Collines", ar: "عملاق التلال", ru: "Горный великан", tr: "Tepe Devi" },
  "Wyvern": { en: "Wyvern", zh: "双足飞龙", hi: "विवर्न", es: "Wyvern", fr: "Wyverne", ar: "ويفرن", ru: "Виверна", tr: "Wyvern" },
  "Ateş Ejderi": { en: "Fire Dragon", zh: "火龙", hi: "अग्नि ड्रैगन", es: "Dragón de Fuego", fr: "Dragon de Feu", ar: "تنين النار", ru: "Огненный дракон", tr: "Ateş Ejderi" },
  "Kadim Ejder": { en: "Ancient Dragon", zh: "远古巨龙", hi: "प्राचीन ड्रैगन", es: "Dragón Ancestral", fr: "Dragon Ancien", ar: "التنين القديم", ru: "Древний дракон", tr: "Kadim Ejder" },
  "Antik Ejder": { en: "Ancient Wyrm", zh: "上古龙蛇", hi: "प्राचीन व्योर्म", es: "Sierpe Antigua", fr: "Wyrm Antique", ar: "الثعبان العتيق", ru: "Древний змей", tr: "Antik Ejder" },
  "Karanlık Lord": { en: "Dark Lord", zh: "黑暗领主", hi: "अंधेरा भगवान", es: "Señor Oscuro", fr: "Seigneur des Ténèbres", ar: "سيد الظلام", ru: "Тёмный лорд", tr: "Karanlık Lord" },
  "Ejder Kralı": { en: "Dragon King", zh: "龙王", hi: "ड्रैगन राजा", es: "Rey Dragón", fr: "Roi Dragon", ar: "ملك التنانين", ru: "Король драконов", tr: "Ejder Kralı" },
};

export const regionTranslations: TranslationMap = {
  "Yeşil Vadi": { en: "Green Valley", zh: "绿色山谷", hi: "हरी घाटी", es: "Valle Verde", fr: "Vallée Verte", ar: "الوادي الأخضر", ru: "Зелёная долина", tr: "Yeşil Vadi" },
  "Küllü Ocak": { en: "Ashen Forge", zh: "灰烬熔炉", hi: "राख की भट्टी", es: "Fragua Cenicienta", fr: "Forge Cendrée", ar: "المحراب الرمادي", ru: "Пепельная кузница", tr: "Küllü Ocak" },
  "Yıldız Çölü": { en: "Star Desert", zh: "星辰沙漠", hi: "तारा रेगिस्तान", es: "Desierto Estelar", fr: "Désert Étoilé", ar: "صحراء النجوم", ru: "Звёздная пустыня", tr: "Yıldız Çölü" },
  "Obsidyen Kale": { en: "Obsidian Fortress", zh: "黑曜石堡垒", hi: "ऑब्सीडियन किला", es: "Fortaleza de Obsidiana", fr: "Forteresse d'Obsidienne", ar: "قلعة الأوبسيديان", ru: "Обсидиановая крепость", tr: "Obsidyen Kale" },
  "Ejder Zirvesi": { en: "Dragon Peak", zh: "龙之巅峰", hi: "ड्रैगन शिखर", es: "Pico del Dragón", fr: "Pic du Dragon", ar: "قمة التنين", ru: "Драконий пик", tr: "Ejder Zirvesi" },
};

export const skillActionTranslations: TranslationMap = {
  "Normal Tree": { en: "Normal Log", zh: "普通原木", hi: "सामान्य लकड़ी", es: "Tronco Normal", fr: "Bûche Normale", ar: "خشب عادي", ru: "Обычное бревно", tr: "Normal Odun" },
  "Oak Tree": { en: "Oak Log", zh: "橡木", hi: "ओक की लकड़ी", es: "Tronco de Roble", fr: "Bûche de Chêne", ar: "خشب بلوط", ru: "Дубовое бревно", tr: "Meşe Odunu" },
  "Willow Tree": { en: "Willow Log", zh: "柳木", hi: "विलो की लकड़ी", es: "Tronco de Sauce", fr: "Bûche de Saule", ar: "خشب صفصاف", ru: "Ивовое бревно", tr: "Söğüt Odunu" },
  "Maple Tree": { en: "Maple Log", zh: "枫木", hi: "मेपल की लकड़ी", es: "Tronco de Arce", fr: "Bûche d'Érable", ar: "خشب قيقب", ru: "Кленовое бревно", tr: "Akçaağaç Odunu" },
  "Yew Tree": { en: "Yew Log", zh: "紫杉木", hi: "यू की लकड़ी", es: "Tronco de Tejo", fr: "Bûche d'If", ar: "خشب طقسوس", ru: "Тисовое бревно", tr: "Porsuk Odunu" },
  "Magic Tree": { en: "Magic Log", zh: "魔法木", hi: "जादुई लकड़ी", es: "Tronco Mágico", fr: "Bûche Magique", ar: "خشب سحري", ru: "Магическое бревно", tr: "Büyülü Odun" },
  "Copper Ore": { en: "Copper Ore", zh: "铜矿石", hi: "तांबा अयस्क", es: "Mineral de Cobre", fr: "Minerai de Cuivre", ar: "خام النحاس", ru: "Медная руда", tr: "Bakır Cevheri" },
  "Tin Ore": { en: "Tin Ore", zh: "锡矿石", hi: "टिन अयस्क", es: "Mineral de Estaño", fr: "Minerai d'Étain", ar: "خام القصدير", ru: "Оловянная руда", tr: "Kalay Cevheri" },
  "Iron Ore": { en: "Iron Ore", zh: "铁矿石", hi: "लोहा अयस्क", es: "Mineral de Hierro", fr: "Minerai de Fer", ar: "خام الحديد", ru: "Железная руда", tr: "Demir Cevheri" },
  "Coal": { en: "Coal", zh: "煤炭", hi: "कोयला", es: "Carbón", fr: "Charbon", ar: "فحم", ru: "Уголь", tr: "Kömür" },
  "Silver Ore": { en: "Silver Ore", zh: "银矿石", hi: "चांदी अयस्क", es: "Mineral de Plata", fr: "Minerai d'Argent", ar: "خام الفضة", ru: "Серебряная руда", tr: "Gümüş Cevheri" },
  "Gold Ore": { en: "Gold Ore", zh: "金矿石", hi: "सोना अयस्क", es: "Mineral de Oro", fr: "Minerai d'Or", ar: "خام الذهب", ru: "Золотая руда", tr: "Altın Cevheri" },
  "Mithril Ore": { en: "Mithril Ore", zh: "秘银矿石", hi: "मिथ्रिल अयस्क", es: "Mineral de Mithril", fr: "Minerai de Mithril", ar: "خام ميثريل", ru: "Мифриловая руда", tr: "Mithril Cevheri" },
  "Adamant Ore": { en: "Adamant Ore", zh: "精金矿石", hi: "एडामेंट अयस्क", es: "Mineral de Adamantio", fr: "Minerai d'Adamante", ar: "خام أدامنت", ru: "Адамантовая руда", tr: "Adamant Cevheri" },
  "Rune Ore": { en: "Rune Ore", zh: "符文矿石", hi: "रूण अयस्क", es: "Mineral Rúnico", fr: "Minerai Runique", ar: "خام رونية", ru: "Руническая руда", tr: "Runik Cevher" },
  "Raw Shrimp": { en: "Raw Shrimp", zh: "生虾", hi: "कच्ची झींगा", es: "Camarón Crudo", fr: "Crevette Crue", ar: "روبيان نيء", ru: "Сырые креветки", tr: "Çiğ Karides" },
  "Raw Sardine": { en: "Raw Sardine", zh: "生沙丁鱼", hi: "कच्ची सार्डिन", es: "Sardina Cruda", fr: "Sardine Crue", ar: "سردين نيء", ru: "Сырая сардина", tr: "Çiğ Sardalya" },
  "Raw Herring": { en: "Raw Herring", zh: "生鲱鱼", hi: "कच्ची हेरिंग", es: "Arenque Crudo", fr: "Hareng Cru", ar: "رنجة نيئة", ru: "Сырая сельдь", tr: "Çiğ Ringa" },
  "Raw Trout": { en: "Raw Trout", zh: "生鳟鱼", hi: "कच्ची ट्राउट", es: "Trucha Cruda", fr: "Truite Crue", ar: "سلمون مرقط نيء", ru: "Сырая форель", tr: "Çiğ Alabalık" },
  "Raw Salmon": { en: "Raw Salmon", zh: "生鲑鱼", hi: "कच्ची सैल्मन", es: "Salmón Crudo", fr: "Saumon Cru", ar: "سلمون نيء", ru: "Сырой лосось", tr: "Çiğ Somon" },
  "Raw Tuna": { en: "Raw Tuna", zh: "生金枪鱼", hi: "कच्ची टूना", es: "Atún Crudo", fr: "Thon Cru", ar: "تونة نيئة", ru: "Сырой тунец", tr: "Çiğ Ton Balığı" },
  "Raw Lobster": { en: "Raw Lobster", zh: "生龙虾", hi: "कच्चा लॉबस्टर", es: "Langosta Cruda", fr: "Homard Cru", ar: "كركند نيء", ru: "Сырой омар", tr: "Çiğ Istakoz" },
  "Raw Swordfish": { en: "Raw Swordfish", zh: "生剑鱼", hi: "कच्ची स्वोर्डफिश", es: "Pez Espada Crudo", fr: "Espadon Cru", ar: "سمكة سيف نيئة", ru: "Сырая рыба-меч", tr: "Çiğ Kılıç Balığı" },
  "Raw Shark": { en: "Raw Shark", zh: "生鲨鱼", hi: "कच्ची शार्क", es: "Tiburón Crudo", fr: "Requin Cru", ar: "قرش نيء", ru: "Сырая акула", tr: "Çiğ Köpekbalığı" },
};

export function getItemTranslations(englishName: string): Record<string, string> | null {
  return itemTranslations[englishName] || null;
}

export function getMonsterTranslations(turkishName: string): Record<string, string> | null {
  return monsterTranslations[turkishName] || null;
}

export function getRegionTranslations(turkishName: string): Record<string, string> | null {
  return regionTranslations[turkishName] || null;
}

export function getSkillActionTranslations(englishName: string): Record<string, string> | null {
  return skillActionTranslations[englishName] || null;
}

export function enrichWithTranslations<T extends { name: string }>(
  items: T[],
  translationMap: TranslationMap
): (T & { nameTranslations: Record<string, string> })[] {
  return items.map(item => ({
    ...item,
    nameTranslations: translationMap[item.name] || { en: item.name }
  }));
}
