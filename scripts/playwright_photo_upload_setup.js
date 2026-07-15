async (page) => {
  const waitVisible = async (locator, timeout = 25000) => {
    await locator.filter({ visible: true }).first().waitFor({ state: "visible", timeout });
  };

  await page.setViewportSize({ width: 390, height: 844 });
  const appOrigin = await page.evaluate(() => window.location.origin);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.goto(`${appOrigin}/signup`, { waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("auth-join-email"));

  const timestamp = Date.now();
  await page.getByTestId("auth-join-email").fill(`photo-${timestamp}@ilog.test`);
  await page.getByTestId("auth-join-caregiver-name").fill("사진 테스트");
  await page.getByTestId("auth-join-password").fill("Ilog1234!");
  await page.getByTestId("auth-join-submit").click();
  await waitVisible(page.getByTestId("required-child-profile"));
  await page.getByTestId("required-child-name").fill("사진 테스트 아이");
  await page.getByTestId("required-child-submit").click();
  await waitVisible(page.getByTestId("screen-dashboard"));

  await page.goto(`${appOrigin}/photo-album`, { waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("screen-photo-album"));
  await waitVisible(page.getByTestId("photo-album-add"));
  await page.getByTestId("photo-album-add").click();
}
