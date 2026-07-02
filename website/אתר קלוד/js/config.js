/**
 * config.js
 * ---------
 * Central configuration for the Moovitdos landing page.
 * Exposes a single global namespace `window.MoovitdosConfig` consumed by
 * api.js / ui.js / main.js (the files load with `defer` in the order
 * config -> api -> ui -> main, so plain globals are safe and ordered).
 *
 * Responsibilities:
 *  - GitHub repo coordinates and all derived API / raw URLs.
 *  - The full SITE_INFO_CONTENT object (copied verbatim from the old site).
 */
(function () {
  'use strict';

  /** GitHub account + repository that hosts the releases, screenshots and docs. */
  const username = 'moovitdos';
  const repo = 'moovidos';

  /** Releases REST endpoint (paginated by api.js). */
  const releasesApiUrl = `https://api.github.com/repos/${username}/${repo}/releases`;
  /** Contents of the /screenshots directory (gallery source). */
  const screenshotsApiUrl = `https://api.github.com/repos/${username}/${repo}/contents/screenshots`;
  /** Raw README (kept for parity with the old site; not actively rendered). */
  const readmeRawUrl = `https://raw.githubusercontent.com/${username}/${repo}/main/README.md`;
  /** Raw User Guide markdown shown inside the guide modal. */
  const guideRawUrl = `https://raw.githubusercontent.com/${username}/${repo}/main/User_Guide.md`;

  /**
   * Site information content.
   * Copied verbatim from the old site — every Hebrew string, icon and list
   * item is preserved exactly. Edit text here to update the info cards.
   */
  const SITE_INFO_CONTENT = {
    title: 'מובידוס — התחבורה הציבורית, מותאמת למכשיר הכשר שלך',
    intro: 'האפליקציה מאפשרת קבלת מידע חכם ומהיר על תחבורה ציבורית, ומותאמת במיוחד לבעלי מכשירים עם סים כשר ומכשירי מקשים [אנדרואיד 4.4 ומעלה].',
    sections: [
      {
        title: 'מידע בזמן אמת',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
        content: "קבלת המידע בזמן אמת נעשית באמצעות חיוג אוטומטי מתוך האפליקציה לקווי מידע קוליים (כמו 'קל קו'). האפליקציה חוסכת לכם את ההאזנה לתפריטים – היא שולחת באופן אוטומטי את מספר התחנה והקו המבוקשים מיד עם תחילת השיחה, כך שהמידע מתקבל באופן מיידי."
      },
      {
        title: 'תכנון מסלול',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"></circle><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"></path><circle cx="18" cy="5" r="3"></circle></svg>',
        content: 'רוצים להגיע ליעד? הזינו מאיפה לאן, ומובידוס תציג את מסלולי הנסיעה הטובים ביותר, כולל החלפות בין קווים. וזה היתרון הגדול: תכנון המסלול עובד גם ללא חיבור לאינטרנט — בדיוק מה שחסר באפליקציות אחרות.'
      },
      {
        title: 'לוחות זמנים אופליין',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
        content: 'לוחות הזמנים המלאים והרשמיים של כל קו שמורים אצלכם במכשיר וזמינים בכל מקום — גם כשאין חיבור לאינטרנט וגם כשאין קליטה. תמיד תדעו מתי האוטובוס הבא.'
      },
      {
        title: 'תזכורת והתראה לפני הגעה',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>',
        content: 'האפליקציה מאפשרת לכם להגדיר תזכורת על תחנה מסוימת במסלול הקו, ותתריע בפניכם (בצליל או ברטט לבחירתכם) לפני ההגעה ליעד – הכל אופליין ובדיוק מירבי.'
      },
      {
        title: 'תכונות נוספות',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
        list: [
          '<strong>חיפוש חכם:</strong> איתור מהיר לפי מספר קו, מספר תחנה (מק"ט), שם תחנה, מיקום נוכחי או כתובת.',
          '<strong>שילוב עם מפות:</strong> האפליקציה משתלבת עם אפליקציית מפות המותקנת על מכשירכם. ניתן לשתף מיקום מכל אפליקציית מפות אל "מובידוס" ולראות מיד את כל התחנות שבאזור. כמו כן ניתן לשתף מיקום של תחנה, כתובת או נקודת עניין לאפליקציית המפות שלכם ולראות אותה על המפה.',
          '<strong>מועדפים:</strong> שמירה של תחנות, קווים, מיקומים ואנשי קשר לחיוג מהיר, לגישה נוחה ביומיום.'
        ]
      },
      {
        title: 'התאמה למכשירי מקשים',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><path d="M6 8h.01"></path><path d="M10 8h.01"></path><path d="M14 8h.01"></path><path d="M18 8h.01"></path><path d="M6 12h.01"></path><path d="M10 12h.01"></path><path d="M14 12h.01"></path><path d="M18 12h.01"></path><path d="M6 16h.01"></path><path d="M10 16h.01"></path><path d="M14 16h.01"></path><path d="M18 16h.01"></path></svg>',
        content: 'האפליקציה עברה התאמה מיוחדת לשימוש קל ונוח דרך המקשים הפיזיים של המכשיר:',
        list: [
          'מקש <span class="key-badge">*</span> (כוכבית): חזרה למסך הבית.',
          'מקש <span class="key-badge">#</span> (סולמית): פתיחת מסך ההגדרות.',
          'מקש <strong>שמאלי</strong>: ביצוע חיוג (במסכי החיפוש הרגילים).',
          'מקש <strong>אישור</strong> (אמצעי): ביצוע חיוג ישיר (במסך המועדפים).'
        ]
      },
      {
        title: 'עלות ורכישה',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
        content: 'השימוש באפליקציה כרוך ב<strong>רכישה חד-פעמית בלבד</strong> — בלי מנוי ובלי תשלומים חוזרים. מעת לעת נפתחות תקופות ניסיון שמאפשרות להתנסות באפליקציה בחינם:',
        price: 'רכישה חד-פעמית של 10 ש"ח — בלי מנוי, בלי תשלום חוזר, לתמיד.',
        footer: 'לרכישת רישיון שימוש, יש לפנות לכתובת המייל המופיעה בתחתית הדף.'
      }
    ],
    feedback: {
      title: 'משוב והערות',
      content: 'האפליקציה פותחה במטרה לעזור ולייעל את הנסיעה שלכם. אשמח מאוד לשמוע מכם הערות, הארות והצעות לשיפור. אני קורא הכל ואולי אף אשפר את האפליקציה בהתאם.'
    }
  };

  /** Public, read-only configuration namespace. */
  window.MoovitdosConfig = Object.freeze({
    username,
    repo,
    releasesApiUrl,
    screenshotsApiUrl,
    readmeRawUrl,
    guideRawUrl,
    SITE_INFO_CONTENT
  });
})();
