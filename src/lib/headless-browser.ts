export async function launchHeadlessBrowser() {
  const { chromium } = await import("playwright-core");

  if (process.env.VERCEL) {
    const { default: sparticuzChromium } = await import("@sparticuz/chromium");
    return chromium.launch({
      executablePath: await sparticuzChromium.executablePath(),
      args: sparticuzChromium.args,
      headless: true,
    });
  }
  return chromium.launch({ headless: true });
}
