async (page) => {
  const waitVisible = async (locator, timeout = 25000) => {
    await locator.filter({ visible: true }).first().waitFor({ state: "visible", timeout });
  };

  const appOrigin = await page.evaluate(() => window.location.origin);

  await page.goto(`${appOrigin}/family-chat`, { waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("screen-family-chat"));
  await waitVisible(page.getByTestId("family-chat-pick-image"));
  await page.getByTestId("family-chat-pick-image").click();
}
