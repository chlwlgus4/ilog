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
    () => document.querySelectorAll('[data-testid^="photo-album-item-"]').length === 3,
    undefined,
    { timeout: 25000 },
  );

  if (await photoItems.count() !== 3) {
    throw new Error(`다중 업로드 뒤 사진 개수가 3개가 아닙니다: ${await photoItems.count()}`);
  }

  const gridGeometry = await photoItems.evaluateAll((items) =>
    items.slice(0, 3).map((item) => {
      const rect = item.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, width: rect.width };
    }),
  );
  const viewportWidth = await page.evaluate(() => window.innerWidth);

  if (
    gridGeometry.length !== 3 ||
    Math.max(...gridGeometry.map((item) => item.top)) - Math.min(...gridGeometry.map((item) => item.top)) > 2 ||
    !(gridGeometry[0].left < gridGeometry[1].left && gridGeometry[1].left < gridGeometry[2].left) ||
    gridGeometry[2].right > viewportWidth - 15
  ) {
    throw new Error(`사진 앨범이 3열로 정렬되지 않았습니다: ${JSON.stringify(gridGeometry)}`);
  }

  await page.screenshot({ path: "photo-album-three-columns.png", scale: "css" });

  await photoItems.first().click();
  await waitForFullscreenPreview("photo-album-preview");
  await page.screenshot({ path: "photo-album-preview.png", scale: "css" });
  await page.getByTestId("photo-album-preview-close").click();
  await page.getByTestId("photo-album-preview").waitFor({ state: "hidden", timeout: 10000 });

  const signedUrlRequests = [];
  const trackSignedUrlRequests = (request) => {
    if (request.method() === "POST" && request.url().includes("/storage/v1/object/sign/family-media")) {
      signedUrlRequests.push(request.url());
    }
  };
  page.on("request", trackSignedUrlRequests);
  await page.getByTestId("back-사진-앨범").click();
  await waitVisible(page.getByTestId("screen-settings"));
  await page.getByText("사진 앨범", { exact: true }).click();
  await waitVisible(page.getByTestId("screen-photo-album"));
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="photo-album-item-"]').length === 3,
    undefined,
    { timeout: 10000 },
  );
  page.off("request", trackSignedUrlRequests);

  if (signedUrlRequests.length > 0) {
    throw new Error(`앨범 재진입 때 서명 URL을 다시 요청했습니다: ${signedUrlRequests.length}건`);
  }

  await page.getByTestId("photo-album-select").click();
  await photoItems.first().click();
  await page.getByTestId("photo-album-delete").click();
  await waitVisible(page.getByTestId("photo-album-delete-dialog"));
  await page.getByTestId("photo-album-delete-confirm").click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="photo-album-item-"]').length === 2,
    undefined,
    { timeout: 25000 },
  );

  if (await photoItems.count() !== 2) {
    throw new Error(`사진 삭제 뒤 남은 사진 개수가 2개가 아닙니다: ${await photoItems.count()}`);
  }

  await page.screenshot({ path: "photo-album-uploaded-and-deleted.png", scale: "css" });
}
