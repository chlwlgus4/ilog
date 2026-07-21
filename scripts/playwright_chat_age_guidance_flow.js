async (page) => {
  const waitVisible = async (locator, timeout = 25000) => {
    await locator.filter({ visible: true }).first().waitFor({ state: "visible", timeout });
  };
  const visibleByTestId = (testId) => page.getByTestId(testId).filter({ visible: true }).first();
  const expectText = async (testId, expectedTexts) => {
    const value = await visibleByTestId(testId).innerText();

    for (const expectedText of expectedTexts) {
      if (!value.includes(expectedText)) {
        throw new Error(`${testId} 화면에서 '${expectedText}' 문구를 찾지 못했습니다.`);
      }
    }
  };
  const waitForSavedChatMessage = async (body) => {
    const savedMessage = page
      .locator('[data-testid^="family-chat-message-"]:not([data-testid^="family-chat-message--"])')
      .filter({ hasText: body })
      .last();

    await savedMessage.waitFor({ state: "visible", timeout: 25000 });
    return savedMessage;
  };
  const expectMessageAboveComposer = async (message) => {
    const [messageBox, composerBox] = await Promise.all([
      message.boundingBox(),
      visibleByTestId("family-chat-composer").boundingBox(),
    ]);

    if (!messageBox || !composerBox || messageBox.y + messageBox.height > composerBox.y - 8) {
      throw new Error(`최신 가족 메시지가 입력창에 가려졌습니다: ${JSON.stringify({ messageBox, composerBox })}`);
    }
  };

  await page.setViewportSize({ width: 390, height: 844 });
  const appOrigin = await page.evaluate(() => window.location.origin);

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${appOrigin}/login`, { waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("screen-login"));

  const testEmail = `chat-speed-${Date.now()}@ilog.test`;
  await page.getByTestId("go-signup").click();
  await page.waitForURL("**/signup", { timeout: 10000 });
  await waitVisible(page.getByTestId("auth-join-email"));
  await page.getByTestId("auth-join-email").fill(testEmail);
  await page.getByTestId("auth-join-caregiver-name").fill("채팅테스트");
  await page.getByTestId("auth-join-password").fill("Ilog1234!");
  await page.getByTestId("auth-join-submit").click();
  await waitVisible(page.getByTestId("required-child-profile"));
  await page.getByTestId("required-child-name").fill("테스트아이");
  await page.getByTestId("required-child-submit").click();
  await waitVisible(page.getByTestId("screen-dashboard"));

  await visibleByTestId("open-family-chat").click();
  await page.waitForURL("**/family-chat", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-family-chat"));
  const composer = visibleByTestId("family-chat-composer");
  const composerBox = await composer.boundingBox();
  const viewport = page.viewportSize();

  if (!composerBox || !viewport || composerBox.y < 0 || composerBox.y + composerBox.height > viewport.height) {
    throw new Error(`가족 대화 입력창이 화면 밖에 있습니다: ${JSON.stringify({ composerBox, viewport })}`);
  }

  const message = "전송 즉시 표시 확인";
  await visibleByTestId("family-chat-input").fill(message);
  const sendStartedAt = Date.now();
  await visibleByTestId("family-chat-send").click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="family-chat-input"]')?.value === "",
    undefined,
    { timeout: 2500 },
  );
  const clearElapsedMs = Date.now() - sendStartedAt;

  if (clearElapsedMs > 2000) {
    throw new Error(`채팅 입력창이 전송 직후 비워지지 않았습니다: ${clearElapsedMs}ms`);
  }

  const savedMessage = await waitForSavedChatMessage(message);
  await expectMessageAboveComposer(savedMessage);
  await page.screenshot({ path: "family-chat-send-speed.png", scale: "css" });

  await visibleByTestId("family-chat-back").click();
  await page.waitForURL("**/home", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-dashboard"));
  await visibleByTestId("bottom-plus").click();
  await page.waitForURL("**/quick-add", { timeout: 10000 });
  await visibleByTestId("quick-feeding").click();
  await page.waitForURL("**/feeding-add", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-feeding-add"));
  await expectText("screen-feeding-add", ["기록 참고", "수유 방법을 선택하면"]);
  await page.getByText("분유", { exact: true }).filter({ visible: true }).first().click();
  await expectText("screen-feeding-add", ["30-60ml", "2-3시간"]);
  await page.screenshot({ path: "feeding-age-guidance.png", scale: "css" });
}
