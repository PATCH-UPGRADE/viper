export async function launchHeadlessBrowser() {
  const { chromium } = await import("playwright-core");

  if (!process.env.VERCEL) return chromium.launch();

  const { default: sparticuzChromium } = await import("@sparticuz/chromium");
  return chromium.launch({
    executablePath: await sparticuzChromium.executablePath(),
    args: sparticuzChromium.args,
  });
}
