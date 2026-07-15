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

  await waitVisible(page.getByTestId("family-chat-composer"));
  await page.getByTestId("family-chat-input").fill("채팅 사진 확대 확인");
  await page.getByTestId("family-chat-send").click();

  const imageMessages = page.locator('[data-testid^="family-chat-image-"]').filter({ visible: true });
  await imageMessages.last().waitFor({ state: "visible", timeout: 25000 });
  await imageMessages.last().click();
  await waitForFullscreenPreview("family-chat-image-preview");
  await page.screenshot({ path: "family-chat-image-preview.png", scale: "css" });
  await page.getByTestId("family-chat-image-preview-close").click();
  await page.getByTestId("family-chat-image-preview").waitFor({ state: "hidden", timeout: 10000 });
}
