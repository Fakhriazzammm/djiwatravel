export const GOOGLE_ANALYTICS_ID = "G-RTNZ9ND2TH";

export const googleAnalyticsHeadScripts = [
  {
    async: true,
    src: `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`,
  },
  {
    children: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GOOGLE_ANALYTICS_ID}');`,
  },
] as const;
