async (page) => {
  const waitVisible = async (locator, timeout = 25000) => {
    await locator.filter({ visible: true }).first().waitFor({ state: "visible", timeout });
  };

  await waitVisible(page.getByTestId("screen-photo-album"));
  await page
    .getByText("사진 앨범에 저장했어요.", { exact: true })
    .filter({ visible: true })
    .waitFor({ state: "visible", timeout: 25000 });
  await page
    .locator('[data-testid^="photo-album-item-"]')
    .filter({ visible: true })
    .first()
    .waitFor({ state: "visible", timeout: 25000 });
  await page.screenshot({ path: "photo-album-uploaded.png", scale: "css" });
}
