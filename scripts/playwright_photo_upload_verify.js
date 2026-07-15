async (page) => {
  const waitVisible = async (locator, timeout = 25000) => {
    await locator.filter({ visible: true }).first().waitFor({ state: "visible", timeout });
  };

  const waitForFullscreenPreview = async (testId) => {
    await page.waitForFunction(
      (previewTestId) => {
        const preview = document.querySelector(`[data-testid="${previewTestId}"]`);

        if (!preview) {
          return false;
        }

        const rect = preview.getBoundingClientRect();
        return rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9;
      },
      testId,
      { timeout: 10000 },
    );
    await page.waitForTimeout(500);
  };

  await waitVisible(page.getByTestId("screen-photo-album"));
  const photoItems = page.locator('[data-testid^="photo-album-item-"]').filter({ visible: true });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="photo-album-item-"]').length === 2,
    undefined,
    { timeout: 25000 },
  );

  if (await photoItems.count() !== 2) {
    throw new Error(`다중 업로드 뒤 사진 개수가 2개가 아닙니다: ${await photoItems.count()}`);
  }

  await photoItems.first().click();
  await waitForFullscreenPreview("photo-album-preview");
  await page.screenshot({ path: "photo-album-preview.png", scale: "css" });
  await page.getByTestId("photo-album-preview-close").click();
  await page.getByTestId("photo-album-preview").waitFor({ state: "hidden", timeout: 10000 });

  await page.getByTestId("photo-album-select").click();
  await photoItems.first().click();
  await page.getByTestId("photo-album-delete").click();
  await waitVisible(page.getByTestId("photo-album-delete-dialog"));
  await page.getByTestId("photo-album-delete-confirm").click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="photo-album-item-"]').length === 1,
    undefined,
    { timeout: 25000 },
  );

  if (await photoItems.count() !== 1) {
    throw new Error(`사진 삭제 뒤 남은 사진 개수가 1개가 아닙니다: ${await photoItems.count()}`);
  }

  await page.screenshot({ path: "photo-album-uploaded-and-deleted.png", scale: "css" });
}
