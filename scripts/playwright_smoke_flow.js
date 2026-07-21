async (page) => {
  const supabaseRestFailures = [];
  const readJwtRole = (authorization) => {
    const token = authorization?.replace(/^Bearer\\s+/i, "");

    if (!token || token.split(".").length !== 3) {
      return null;
    }

    try {
      return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).role ?? null;
    } catch {
      return "unreadable";
    }
  };

  page.on("response", async (response) => {
    if (response.status() < 400 || !response.url().includes(".supabase.co/rest/v1/")) {
      return;
    }

    const body = await response.text().catch(() => "");
    const authorization = response.request().headers().authorization;
    supabaseRestFailures.push({
      status: response.status(),
      url: response.url(),
      pageUrl: page.url(),
      authorizationRole: readJwtRole(authorization),
      body,
    });
  });

  const waitVisible = async (locator, timeout = 20000) => {
    await locator.filter({ visible: true }).first().waitFor({ state: "visible", timeout });
  };

  const visibleByTestId = (testId) => page.getByTestId(testId).filter({ visible: true }).first();

  const visibleText = async (testId) => page.getByTestId(testId).filter({ visible: true }).first().innerText();

  const expectText = async (testId, expectedTexts) => {
    const text = await visibleText(testId);
    for (const expected of expectedTexts) {
      if (!text.includes(expected)) {
        throw new Error(`${testId} 화면에서 '${expected}' 문구를 찾지 못했습니다.`);
      }
    }
  };

  const expectNoText = async (testId, forbiddenTexts) => {
    const text = await visibleText(testId);
    for (const forbidden of forbiddenTexts) {
      if (text.includes(forbidden)) {
        throw new Error(`${testId} 화면에 샘플 문구가 남아 있습니다: ${forbidden}`);
      }
    }
  };

  const expectStatsChartAxisLabelsVisible = async () => {
    const chart = visibleByTestId("stats-chart-data");
    const geometry = await chart.evaluate((element) => {
      const svg = element.querySelector("svg");

      if (!svg) {
        return { hasSvg: false, labels: [] };
      }

      const svgRect = svg.getBoundingClientRect();
      const labels = Array.from(svg.querySelectorAll("text")).map((label) => {
        const rect = label.getBoundingClientRect();
        return {
          text: label.textContent ?? "",
          top: rect.top,
          bottom: rect.bottom,
        };
      });

      return {
        hasSvg: true,
        chartHeight: element.getBoundingClientRect().height,
        svgTop: svgRect.top,
        svgBottom: svgRect.bottom,
        labels,
      };
    });

    if (!geometry.hasSvg || geometry.labels.length === 0) {
      throw new Error(`통계 차트의 X축 라벨을 찾지 못했습니다: ${JSON.stringify(geometry)}`);
    }

    if (geometry.chartHeight < 150) {
      throw new Error(`통계 차트 높이가 X축 라벨을 표시하기에 부족합니다: ${geometry.chartHeight}px`);
    }

    const clippedLabels = geometry.labels.filter((label) => (
      label.top < geometry.svgTop + 1 || label.bottom > geometry.svgBottom - 1
    ));
    if (clippedLabels.length > 0) {
      throw new Error(`통계 차트 X축 라벨이 잘립니다: ${JSON.stringify(clippedLabels)}`);
    }
  };

  const expectScrollable = async (testId) => {
    const scrollState = await visibleByTestId(testId).evaluate(async (element) => {
      const candidates = [element, ...Array.from(element.querySelectorAll("*"))];
      const scrollElement = candidates.find((candidate) => candidate.scrollHeight > candidate.clientHeight + 8);

      if (!scrollElement) {
        return { found: false, before: 0, after: 0, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
      }

      scrollElement.scrollTop = 0;
      const before = scrollElement.scrollTop;
      scrollElement.scrollTop = scrollElement.scrollHeight;
      await new Promise((resolve) => requestAnimationFrame(resolve));

      return {
        found: true,
        before,
        after: scrollElement.scrollTop,
        scrollHeight: scrollElement.scrollHeight,
        clientHeight: scrollElement.clientHeight,
      };
    });

    if (!scrollState.found || scrollState.after <= scrollState.before) {
      throw new Error(`${testId} 화면의 스크롤이 동작하지 않습니다: ${JSON.stringify(scrollState)}`);
    }
  };

  const bodyMustNotContainLegacyApiText = async () => {
    const bodyText = await page.locator("body").innerText();
    const forbiddenTexts = ["EXPO_PUBLIC_API_BASE_URL", "기존 REST API", "임시 API", "실제 API를 연결하면"];
    for (const text of forbiddenTexts) {
      if (bodyText.includes(text)) {
        throw new Error(`레거시 API 문구가 화면에 남아 있습니다: ${text}`);
      }
    }
  };

  const readProviderButtonFrame = async (testId) => {
    const button = visibleByTestId(testId);
    await waitVisible(button);
    return button.evaluate((element) => {
      const computed = window.getComputedStyle(element);
      return {
        backgroundColor: computed.backgroundColor,
        borderColor: computed.borderTopColor,
        borderWidths: [computed.borderTopWidth, computed.borderRightWidth, computed.borderBottomWidth, computed.borderLeftWidth],
        boxShadow: computed.boxShadow,
        hasSvg: Boolean(element.querySelector("svg")),
      };
    });
  };

  const expectGoogleButtonSoftFrame = async () => {
    const frame = await readProviderButtonFrame("provider-google-auth");
    if (frame.borderWidths.some((width) => width === "0px")) {
      throw new Error(`Google 로그인 버튼이 버튼처럼 구분되지 않습니다: ${frame.borderWidths.join(", ")}`);
    }

    if (["rgb(0, 0, 0)", "rgb(116, 119, 117)"].includes(frame.borderColor)) {
      throw new Error(`Google 로그인 버튼 테두리가 너무 진합니다: ${frame.borderColor}`);
    }

    if (frame.boxShadow === "none") {
      throw new Error("Google 로그인 버튼 그림자가 없어 버튼 구분감이 부족합니다.");
    }
  };

  const expectAppleButtonMatchesGoogleFrame = async () => {
    const googleFrame = await readProviderButtonFrame("provider-google-auth");
    const appleFrame = await readProviderButtonFrame("provider-apple-auth");
    if (appleFrame.backgroundColor !== googleFrame.backgroundColor) {
      throw new Error(`Apple 로그인 버튼 배경이 Google 버튼과 다릅니다: ${appleFrame.backgroundColor} / ${googleFrame.backgroundColor}`);
    }
    if (appleFrame.borderColor !== googleFrame.borderColor) {
      throw new Error(`Apple 로그인 버튼 테두리 색상이 Google 버튼과 다릅니다: ${appleFrame.borderColor} / ${googleFrame.borderColor}`);
    }
    if (appleFrame.borderWidths.join(",") !== googleFrame.borderWidths.join(",")) {
      throw new Error(`Apple 로그인 버튼 테두리 두께가 Google 버튼과 다릅니다: ${appleFrame.borderWidths.join(", ")}`);
    }
    if (appleFrame.boxShadow !== googleFrame.boxShadow) {
      throw new Error("Apple 로그인 버튼 그림자가 Google 버튼과 다릅니다.");
    }

    if (!appleFrame.hasSvg) {
      throw new Error("Apple 로그인 버튼 아이콘이 렌더링되지 않았습니다.");
    }
  };

  const expectLoginBrandLogo = async () => {
    const logo = page.getByTestId("login-brand-logo");
    await waitVisible(logo);
    const logoBox = await logo.boundingBox();
    if (!logoBox || logoBox.width < 210 || logoBox.height < 210) {
      throw new Error(`로그인 로고가 너무 작습니다: ${JSON.stringify(logoBox)}`);
    }
    await expectNoText("screen-login", ["반가워요", "환영합니다"]);
  };

  const expectTimelineComposerClearOfQuickAdd = async () => {
    const composerBox = await visibleByTestId("timeline-compose-panel").boundingBox();
    const quickAddBox = await visibleByTestId("bottom-plus-button").boundingBox();

    if (!composerBox || !quickAddBox || composerBox.y + composerBox.height > quickAddBox.y - 10) {
      throw new Error(`타임라인 메모 입력창이 빠른 추가 버튼과 겹칩니다: ${JSON.stringify({ composerBox, quickAddBox })}`);
    }
  };

  const expectTimelineComposerClearOfFamilyChat = async () => {
    const composerBox = await visibleByTestId("timeline-compose-panel").boundingBox();
    const familyChatBox = await visibleByTestId("open-family-chat").boundingBox();

    if (!composerBox || !familyChatBox || familyChatBox.y + familyChatBox.height > composerBox.y - 10) {
      throw new Error(`타임라인 메모 입력창이 가족 대화 버튼과 겹칩니다: ${JSON.stringify({ composerBox, familyChatBox })}`);
    }
  };

  const expectFamilyChatTheme = async () => {
    const backgroundColor = await visibleByTestId("open-family-chat").evaluate((element) => getComputedStyle(element).backgroundColor);

    if (backgroundColor !== "rgb(231, 246, 243)") {
      throw new Error(`가족 대화 버튼이 앱의 민트 테마 색상을 사용하지 않습니다: ${backgroundColor}`);
    }
  };

  const expectFamilyChatComposerVisible = async () => {
    const composerBox = await visibleByTestId("family-chat-composer").boundingBox();
    const viewport = page.viewportSize();

    if (!composerBox || !viewport || composerBox.y < 0 || composerBox.y + composerBox.height > viewport.height) {
      throw new Error(`가족 대화 입력창이 화면 안에 표시되지 않습니다: ${JSON.stringify({ composerBox, viewport })}`);
    }
  };

  const waitForSavedFamilyChatMessage = async (body) => {
    const savedMessage = page
      .locator('[data-testid^="family-chat-message-"]:not([data-testid^="family-chat-message--"])')
      .filter({ hasText: body })
      .last();

    await savedMessage.waitFor({ state: "visible", timeout: 25000 });
    return savedMessage;
  };

  const expectLatestFamilyChatMessageAboveComposer = async (message) => {
    const [messageBox, composerBox] = await Promise.all([
      message.boundingBox(),
      visibleByTestId("family-chat-composer").boundingBox(),
    ]);

    if (!messageBox || !composerBox || messageBox.y + messageBox.height > composerBox.y - 8) {
      throw new Error(`가족 대화 최신 메시지가 입력창에 가려졌습니다: ${JSON.stringify({ messageBox, composerBox })}`);
    }
  };

  const expectCompactHorizontalGutter = async (testId) => {
    const box = await visibleByTestId(testId).boundingBox();

    if (!box || box.x > 18) {
      throw new Error(`${testId} 화면의 좌우 여백이 여전히 너무 큽니다: ${JSON.stringify(box)}`);
    }
  };

  const expectProfileImagePickerVisible = async (pickerTestId) => {
    const pickerBox = await visibleByTestId(pickerTestId).boundingBox();
    const viewport = page.viewportSize();

    if (!pickerBox || !viewport || pickerBox.width < 34 || pickerBox.height < 34 || pickerBox.x < 0 || pickerBox.y < 0 || pickerBox.x + pickerBox.width > viewport.width || pickerBox.y + pickerBox.height > viewport.height) {
      throw new Error(`${pickerTestId} 프로필 사진 버튼이 화면 안에 정상 노출되지 않습니다: ${JSON.stringify({ pickerBox, viewport })}`);
    }
  };

  await page.setViewportSize({ width: 390, height: 844 });
  const appOrigin = await page.evaluate(() => window.location.origin);

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.goto(`${appOrigin}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 25000 });
  await waitVisible(page.getByTestId("screen-login"));
  await expectLoginBrandLogo();
  await expectText("screen-login", ["Sign in with Google", "Sign in with Apple", "이용약관", "개인정보 처리방침"]);
  await expectGoogleButtonSoftFrame();
  await expectAppleButtonMatchesGoogleFrame();

  const dashboardAfterBlockedAccess = await page.getByTestId("screen-dashboard").count();
  if (dashboardAfterBlockedAccess > 0) {
    throw new Error("비로그인 상태에서 홈 화면이 렌더링되었습니다.");
  }

  await page.goto(`${appOrigin}/terms`, { waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("screen-terms"));
  await expectText("screen-terms", ["서비스 목적", "정식 운영 전"]);
  await expectScrollable("screen-terms");
  await page.goto(`${appOrigin}/login`, { waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("screen-login"));
  await expectLoginBrandLogo();

  const testEmail = `codex-${Date.now()}@ilog.test`;
  const testPassword = "Ilog1234!";
  const updatedPassword = "Ilog5678!";

  await page.getByTestId("go-signup").click();
  await page.waitForURL("**/signup", { timeout: 10000 });
  await waitVisible(page.getByTestId("auth-join-email"));
  const nicknameInput = page.getByTestId("auth-join-caregiver-name");
  if (await nicknameInput.inputValue() !== "보호자") {
    throw new Error("보호자 역할의 기본 닉네임이 보이지 않습니다.");
  }
  await page.getByTestId("auth-join-role-MOM").click();
  if (await nicknameInput.inputValue() !== "엄마") {
    throw new Error("엄마 역할의 기본 닉네임이 자동 반영되지 않았습니다.");
  }
  await page.getByTestId("auth-join-role-GUARDIAN").click();
  if (await nicknameInput.inputValue() !== "보호자") {
    throw new Error("보호자 역할의 기본 닉네임이 자동 복원되지 않았습니다.");
  }
  await page.getByTestId("auth-join-email").fill(testEmail);
  await nicknameInput.fill("지윤");
  await page.getByTestId("auth-join-password").fill(testPassword);
  await page.getByTestId("auth-join-submit").click();
  await waitVisible(page.getByTestId("required-child-profile"));
  await page.getByTestId("required-child-name").fill("테스트아이");
  await page.getByTestId("required-child-submit").click();
  await waitVisible(page.getByTestId("screen-dashboard"), 25000);
  await expectText("screen-dashboard", ["오늘 한눈에 보기", "최근 기록", "수유", "수면", "배변", "체온"]);
  await expectText("screen-dashboard", ["기록 없음", "아직 남겨진 기록이 없어요."]);
  await expectNoText("screen-dashboard", ["180 ml", "43분", "36.5 ℃"]);
  await expectNoText("home-child-header", ["D+"]);
  await expectText("home-child-header", ["개월", "세"]);
  await expectFamilyChatTheme();

  await visibleByTestId("open-family-chat").click();
  await page.waitForURL("**/family-chat", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-family-chat"));
  await expectText("screen-family-chat", ["가족 대화"]);
  await expectNoText("screen-family-chat", ["1명"]);
  if ((await visibleByTestId("family-chat-input").getAttribute("placeholder")) !== "메시지 입력 (@닉네임 태그)") {
    throw new Error("가족 대화 입력창의 직접 태그 안내 문구가 보이지 않습니다.");
  }
  if (await page.getByTestId("family-chat-mentions").count() !== 0) {
    throw new Error("가족 대화에 선택형 태그 UI가 남아 있습니다.");
  }
  await expectFamilyChatComposerVisible();
  await waitVisible(visibleByTestId("family-chat-pick-image"));
  await visibleByTestId("family-chat-input").fill("@보호자 직접 태그 입력 확인");
  await visibleByTestId("family-chat-send").click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="family-chat-input"]')?.value === "",
    undefined,
    { timeout: 25000 },
  );
  const firstSavedChatMessage = await waitForSavedFamilyChatMessage("@보호자 직접 태그 입력 확인");
  await expectLatestFamilyChatMessageAboveComposer(firstSavedChatMessage);
  await visibleByTestId("family-chat-input").fill("가족 대화 시간 묶음 확인");
  await visibleByTestId("family-chat-send").click();
  const secondSavedChatMessage = await waitForSavedFamilyChatMessage("가족 대화 시간 묶음 확인");
  await expectLatestFamilyChatMessageAboveComposer(secondSavedChatMessage);
  const visibleChatTimes = await page.locator('[data-testid^="family-chat-time-"]').filter({ visible: true }).count();
  if (visibleChatTimes !== 1) {
    throw new Error(`같은 분에 연속 전송한 가족 메시지의 시간 표시가 ${visibleChatTimes}개입니다.`);
  }
  await page.screenshot({ path: "family-chat.png", scale: "css" });
  await visibleByTestId("family-chat-back").click();
  await page.waitForURL("**/home", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-dashboard"));

  await visibleByTestId("home-open-alerts").click();
  await page.waitForURL("**/notifications", { timeout: 10000 });
  await waitVisible(page.getByTestId("alerts-view"));
  await expectText("alerts-view", ["새 알림이 없어요."]);
  await expectNoText("alerts-view", ["준호", "민준이", "지현", "180 ml"]);
  await page.screenshot({ path: "alerts-empty.png", scale: "css" });
  await page.goto(`${appOrigin}/home`, { waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("screen-dashboard"));

  await waitVisible(page.getByTestId("dashboard-add-task"));
  await visibleByTestId("dashboard-add-task").click();
  await waitVisible(page.getByTestId("dashboard-task-modal"));
  await expectText("dashboard-task-modal", ["오늘 분담 추가", "담당자", "알림 시간", "저장"]);
  const saveButtonBox = await visibleByTestId("dashboard-save-task").boundingBox();
  const viewport = page.viewportSize();
  if (!saveButtonBox || !viewport || saveButtonBox.y < 0 || saveButtonBox.y + saveButtonBox.height > viewport.height) {
    throw new Error(`분담 등록 모달의 저장 버튼이 화면 밖으로 가려졌습니다: ${JSON.stringify({ saveButtonBox, viewport })}`);
  }
  await page.getByTestId("dashboard-task-title-input").fill("저녁 목욕 준비");
  await page.getByTestId("dashboard-task-reminder-input").fill("5");
  await page.waitForTimeout(350);
  await page.screenshot({ path: "dashboard-task-add.png", scale: "css" });
  await page.getByTestId("dashboard-save-task").click();
  await page.getByTestId("dashboard-task-modal").waitFor({ state: "hidden", timeout: 25000 });
  await waitVisible(page.getByTestId("task-complete-button"), 25000);
  await page.getByText("+1", { exact: true }).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 25000 });

  await visibleByTestId("dashboard-add-task").click();
  await waitVisible(page.getByTestId("dashboard-task-modal"));
  const additionalTaskTitleInput = page.getByTestId("dashboard-task-title-input");
  await additionalTaskTitleInput.fill("기저귀 정리");
  await page.getByTestId("dashboard-task-reminder-10").click();
  await page.getByTestId("dashboard-save-task").click();
  await page.getByTestId("dashboard-task-modal").waitFor({ state: "hidden", timeout: 25000 });
  await page.getByText("+2", { exact: true }).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 25000 });

  await visibleByTestId("dashboard-open-task-list").click();
  await page.waitForURL("**/task-assignments", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-task-assignments"));
  await page.getByText("저녁 목욕 준비", { exact: true }).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 25000 });
  await page.getByText("기저귀 정리", { exact: true }).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 25000 });
  await expectText("screen-task-assignments", ["분담 목록", "오늘의 분담", "저녁 목욕 준비", "기저귀 정리"]);
  await page.screenshot({ path: "task-assignments.png", scale: "css" });
  await visibleByTestId("task-list-add").click();
  await waitVisible(page.getByTestId("dashboard-task-modal"));
  await expectText("dashboard-task-modal", ["오늘 분담 추가", "저장"]);
  await visibleByTestId("dashboard-task-modal-close").click();
  const completionButtons = page.locator('[data-testid^="task-list-complete-"]').filter({ visible: true });
  const firstCompletionTestId = await completionButtons.first().getAttribute("data-testid");
  if (!firstCompletionTestId) {
    throw new Error("분담 목록의 종료 버튼을 찾지 못했습니다.");
  }
  await page.getByTestId(firstCompletionTestId).click();
  await page.getByTestId(firstCompletionTestId).waitFor({ state: "hidden", timeout: 25000 });
  await page.getByText("완료", { exact: true }).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 25000 });
  await visibleByTestId("task-list-prev-date").click();
  await page.getByText("선택한 날짜의 분담", { exact: true }).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 10000 });
  await page.getByText("0건", { exact: true }).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 10000 });
  await visibleByTestId("task-list-next-date").click();
  await page.getByText("저녁 목욕 준비", { exact: true }).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 25000 });
  await visibleByTestId("task-list-date-picker-open").click();
  await waitVisible(page.getByTestId("task-list-date-picker"));
  await visibleByTestId("task-list-date-picker-backdrop").click({ force: true });
  await visibleByTestId("back-분담-목록").click();
  await page.waitForURL("**/home", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-dashboard"));

  await visibleByTestId("tab-더보기").click();
  await page.waitForURL("**/settings", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-settings"));
  await expectText("screen-settings", ["내 프로필", testEmail, "개인정보 수정", "기기 푸시", "채팅 푸시 알림", "새 메시지 내용 미리보기"]);
  await expectProfileImagePickerVisible("settings-profile-image-pick");
  await page.screenshot({ path: "settings-profile-image.png", scale: "css" });
  const pushToggle = page.getByTestId("settings-push-toggle");
  const chatPushToggle = page.getByTestId("settings-chat-push-toggle");
  await waitVisible(pushToggle);
  await waitVisible(chatPushToggle);
  const ensureToggleState = async (toggle, enabled) => {
    const expected = enabled ? "true" : "false";
    if (await toggle.getAttribute("aria-checked") !== expected) {
      await toggle.click();
      await page.waitForFunction(
        ({ testId, nextValue }) => document.querySelector(`[data-testid="${testId}"]`)?.getAttribute("aria-checked") === nextValue,
        { testId: await toggle.getAttribute("data-testid"), nextValue: expected },
        { timeout: 25000 },
      );
    }
  };
  await ensureToggleState(pushToggle, true);
  await ensureToggleState(chatPushToggle, true);
  await chatPushToggle.click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="settings-chat-push-toggle"]')?.getAttribute("aria-checked") === "false",
    undefined,
    { timeout: 25000 },
  );
  await pushToggle.click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="settings-push-toggle"]')?.getAttribute("aria-checked") === "false",
    undefined,
    { timeout: 25000 },
  );
  await chatPushToggle.click();
  await page.waitForFunction(
    () => (
      document.querySelector('[data-testid="settings-push-toggle"]')?.getAttribute("aria-checked") === "true" &&
      document.querySelector('[data-testid="settings-chat-push-toggle"]')?.getAttribute("aria-checked") === "true"
    ),
    undefined,
    { timeout: 25000 },
  );
  await page.waitForTimeout(220);
  await page.screenshot({ path: "settings-chat-push.png", scale: "css" });

  await page.goto(`${appOrigin}/child-info`, { waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("screen-child-info"));
  if (await page.getByTestId("child-info-name-input").inputValue() !== "테스트아이") {
    throw new Error("아이 정보 화면이 세션의 실제 아이 이름을 불러오지 않았습니다.");
  }
  await expectNoText("child-info-dday", ["D+"]);
  await expectText("child-info-dday", ["생후", "개월", "세"]);
  await expectProfileImagePickerVisible("child-profile-image-pick");
  await page.screenshot({ path: "child-profile-age.png", scale: "css" });
  await page.goto(`${appOrigin}/settings`, { waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("screen-settings"));

  await page.goto(`${appOrigin}/family-invite`, { waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("screen-family-management"));
  await expectText("screen-family-management", ["가족 관리", "가족 구성원", "가족 초대", "초대 링크 복사", "초대 코드 복사"]);
  await page.getByTestId("family-invite-copy-link").click();
  await page.getByText("초대 링크를 복사했어요.", { exact: true }).filter({ visible: true }).waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("family-invite-copy-code").click();
  await page.getByText("가족 초대 코드를 복사했어요.", { exact: true }).filter({ visible: true }).waitFor({ state: "visible", timeout: 10000 });
  await page.goto(`${appOrigin}/settings`, { waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("screen-settings"));

  await visibleByTestId("settings-open-personal-info").click();
  await page.waitForURL("**/personal-info", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-personal-info"));
  await expectText("screen-personal-info", ["개인정보 수정", testEmail, "닉네임", "역할", "연락처", "비밀번호 변경"]);
  await page.getByTestId("personal-info-name-input").fill("지윤 수정");
  await page.getByTestId("personal-info-role-DAD").click();
  await page.getByTestId("personal-info-contact-phone-input").fill("010-1234-5678");
  await page.getByTestId("personal-info-current-password-input").fill(testPassword);
  await page.getByTestId("personal-info-new-password-input").fill(updatedPassword);
  await page.getByTestId("personal-info-password-confirmation-input").fill(updatedPassword);
  await visibleByTestId("personal-info-save").click();
  await page.waitForURL("**/settings", { timeout: 25000 });
  await waitVisible(page.getByTestId("screen-settings"));
  await expectText("screen-settings", ["지윤 수정", testEmail]);
  await page.getByText("이 기기에서 로그아웃").filter({ visible: true }).first().click();
  await page.waitForURL("**/login", { timeout: 20000 });
  await waitVisible(page.getByTestId("screen-login"));
  await expectLoginBrandLogo();
  await expectText("screen-login", ["Sign in with Google", "Sign in with Apple"]);
  await expectGoogleButtonSoftFrame();
  await expectAppleButtonMatchesGoogleFrame();

  const emailInput = page.getByTestId("auth-login-email");
  const passwordInput = page.getByTestId("auth-login-password");
  await waitVisible(emailInput);
  await waitVisible(passwordInput);
  await emailInput.fill(testEmail);
  await passwordInput.fill(updatedPassword);

  const emailValue = await emailInput.inputValue();
  const passwordValue = await passwordInput.inputValue();
  if (emailValue !== testEmail) {
    throw new Error("이메일 입력칸에 값이 정상 반영되지 않았습니다.");
  }
  if (passwordValue !== updatedPassword) {
    throw new Error("비밀번호 입력칸에 값이 정상 반영되지 않았습니다.");
  }

  await bodyMustNotContainLegacyApiText();

  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/home", { timeout: 25000 });
  await waitVisible(page.getByTestId("screen-dashboard"));
  await expectText("screen-dashboard", ["오늘 한눈에 보기", "최근 기록", "수유", "수면", "배변", "체온"]);
  await expectText("screen-dashboard", ["기록 없음", "아직 남겨진 기록이 없어요."]);
  await expectNoText("screen-dashboard", ["180 ml", "43분", "36.5 ℃"]);

  for (const tab of ["홈", "기록", "통계", "더보기"]) {
    await waitVisible(page.getByTestId(`tab-${tab}`));
  }
  await waitVisible(page.getByTestId("bottom-plus"));

  await visibleByTestId("bottom-plus").click();
  await page.waitForURL("**/quick-add", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-quick-add"));
  await expectText("screen-quick-add", ["수유", "수면", "배변", "체온", "약/영양제", "유축", "성장", "예방접종", "병원 방문", "메모"]);

  await page.getByText("예방접종").filter({ visible: true }).first().click();
  await page.waitForURL("**/vaccination-add", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-vaccination-add"));
  await expectText("screen-vaccination-add", ["접종명", "접종일", "접종 상태", "가족에게 등록 알림 보내기", "기록 저장"]);
  await page.getByTestId("back-예방접종").click();
  await page.waitForURL("**/home", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-dashboard"));

  await visibleByTestId("bottom-plus").click();
  await page.waitForURL("**/quick-add", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-quick-add"));
  await page.getByText("병원 방문").filter({ visible: true }).first().click();
  await page.waitForURL("**/hospital-add", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-hospital-add"));
  await expectText("screen-hospital-add", ["병원명", "방문 사유", "방문일", "가족에게 등록 알림 보내기", "기록 저장"]);
  await page.getByTestId("back-병원-방문").click();
  await page.waitForURL("**/home", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-dashboard"));

  await visibleByTestId("bottom-plus").click();
  await page.waitForURL("**/quick-add", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-quick-add"));
  await visibleByTestId("quick-feeding").click();
  await page.waitForURL("**/feeding-add", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-feeding-add"));
  await expectText("screen-feeding-add", ["수유량", "기록 참고", "가족에게 등록 알림 보내기", "다음 기록 알림", "기록 저장"]);
  const exactTopSaveCount = await page.getByText("저장", { exact: true }).filter({ visible: true }).count();
  if (exactTopSaveCount > 0) {
    throw new Error("기록 추가 화면 상단에 별도 저장 버튼이 남아 있습니다.");
  }
  const feedingSave = visibleByTestId("feeding-save");
  if ((await feedingSave.getAttribute("aria-disabled")) !== "true") {
    throw new Error("수유량과 수유 방법을 입력하지 않아도 기록 저장이 활성화되어 있습니다.");
  }
  await page.screenshot({ path: "feeding-empty.png", scale: "css" });
  await page.getByTestId("feeding-amount-input").fill("180");
  await page.getByText("분유", { exact: true }).filter({ visible: true }).first().click();
  await expectText("screen-feeding-add", ["30-60ml"]);
  await page.screenshot({ path: "feeding-age-guidance.png", scale: "css" });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="feeding-save"]')?.getAttribute("aria-disabled") !== "true",
    undefined,
    { timeout: 10000 },
  );
  const recordShareToggle = visibleByTestId("record-share-toggle");
  await recordShareToggle.click();
  await expectText("screen-feeding-add", ["수신 대상 제외"]);
  const exclusionButton = page.locator('[data-testid^="record-share-exclude-"]').filter({ visible: true }).first();
  await waitVisible(exclusionButton);
  await exclusionButton.click();
  if ((await exclusionButton.getAttribute("aria-checked")) !== "true") {
    throw new Error("공유 알림 수신 대상 제외가 선택되지 않았습니다.");
  }
  await exclusionButton.click();
  if ((await exclusionButton.getAttribute("aria-checked")) !== "false") {
    throw new Error("공유 알림 수신 대상 제외가 해제되지 않았습니다.");
  }
  await visibleByTestId("record-alarm-toggle-feeding").click();
  await expectText("screen-feeding-add", ["알림 주기 (분)", "알림 대상"]);
  await page.getByText("기록 저장").filter({ visible: true }).first().click();
  await page.waitForURL("**/timeline", { timeout: 25000 });
  await waitVisible(page.getByTestId("screen-timeline"));

  await visibleByTestId("tab-홈").click();
  await page.waitForURL("**/home", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-dashboard"));

  await visibleByTestId("bottom-plus").click();
  await page.waitForURL("**/quick-add", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-quick-add"));
  await visibleByTestId("quick-feeding").click();
  await page.waitForURL("**/feeding-add", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-feeding-add"));
  if ((await visibleByTestId("record-share-toggle").getAttribute("aria-checked")) !== "true") {
    throw new Error("저장한 기록 공유 설정이 다음 기록 화면에 유지되지 않았습니다.");
  }
  await visibleByTestId("back-수유").click();
  await page.waitForURL("**/home", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-dashboard"));

  await visibleByTestId("bottom-plus").click();
  await page.waitForURL("**/quick-add", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-quick-add"));
  await visibleByTestId("quick-cancel").click();
  await page.waitForURL("**/home", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-dashboard"));

  await visibleByTestId("tab-기록").click();
  await page.waitForURL("**/timeline", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-timeline"));
  await waitVisible(page.getByTestId("timeline-compose-panel"));
  await expectTimelineComposerClearOfQuickAdd();
  await expectTimelineComposerClearOfFamilyChat();
  await page.screenshot({ path: "timeline-composer-resting.png", scale: "css" });
  await page.getByTestId("timeline-compose-input").fill("키보드 회피 확인");
  await waitVisible(page.getByText("등록").filter({ visible: true }));
  await page.getByTestId("timeline-compose-input").fill("");
  await visibleByTestId("timeline-date-picker-open").click();
  await waitVisible(page.getByTestId("timeline-date-picker"));
  await visibleByTestId("timeline-date-picker-backdrop").click({ force: true });
  await visibleByTestId("timeline-filter-toggle").click();
  await waitVisible(page.getByTestId("timeline-filter-panel"));
  await waitVisible(page.getByTestId("timeline-filter-search"));
  await waitVisible(page.getByTestId("timeline-filter-feeding"));

  await visibleByTestId("tab-통계").click();
  await page.waitForURL("**/statistics", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-statistics"));
  await expectText("screen-statistics", ["카테고리별 통계", "수유", "수면", "체온", "예방접종", "병원 방문"]);
  await page.getByText("180 ml").filter({ visible: true }).first().waitFor({ state: "visible", timeout: 20000 });
  await waitVisible(page.getByTestId("stats-chart-data"), 20000);
  await expectStatsChartAxisLabelsVisible();
  await page.screenshot({ path: "statistics-chart.png", scale: "css" });
  await expectNoText("screen-statistics", ["1,260", "5,420", "평균 720", "상위 45%"]);
  await visibleByTestId("stats-open-feeding").click();
  await page.waitForURL("**/stats-feeding", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-feeding-stats"));
  await page.getByText("180 ml").filter({ visible: true }).first().waitFor({ state: "visible", timeout: 20000 });
  await expectText("screen-feeding-stats", ["수유 통계", "총 수유량", "기록 목록", "180 ml"]);
  await waitVisible(page.getByTestId("detail-stats-chart-data"), 20000);
  await expectNoText("screen-feeding-stats", ["아직 통계가 없어요", "아직 기록이 없어요"]);
  await visibleByTestId("back-수유-통계").click();
  await page.waitForURL("**/statistics", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-statistics"));
  await page.getByText("주간").filter({ visible: true }).first().click();
  await visibleByTestId("stats-date-picker-open").click();
  await waitVisible(page.getByTestId("stats-date-picker"));
  await visibleByTestId("stats-date-picker-backdrop").click({ force: true });

  await visibleByTestId("tab-더보기").click();
  await page.waitForURL("**/settings", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-settings"));
  await expectText("screen-settings", ["내 프로필", "아이 정보", "가족 관리", "사진 앨범", "기록 리마인더", "개인정보 설정", "앱 정보", "기기 푸시"]);
  await expectNoText("screen-settings", ["아침 요약"]);
  await bodyMustNotContainLegacyApiText();

  await page.getByText("사진 앨범").filter({ visible: true }).first().click();
  await page.waitForURL("**/photo-album", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-photo-album"));
  await waitVisible(visibleByTestId("photo-album-add"));
  await visibleByTestId("back-사진-앨범").click();
  await page.waitForURL("**/settings", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-settings"));

  await visibleByTestId("settings-open-record-reminders").click();
  await page.waitForURL("**/notification-settings", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-notification-settings"));
  await expectText("screen-notification-settings", ["기록 리마인더", "다음 기록 알림", "카테고리별 리마인더", "수유 리마인더", "수면 리마인더", "복약 리마인더", "유축 리마인더"]);
  await expectNoText("screen-notification-settings", ["아침 브리핑 알림", "알림 시간", "예방접종 알림"]);
  await expectNoText("screen-notification-settings", ["기록 리마인더를 준비하는 중이에요."]);
  await expectCompactHorizontalGutter("record-reminders-intro");
  const feedingReminderCard = visibleByTestId("record-alarm-card-feeding");
  await feedingReminderCard.scrollIntoViewIfNeeded();
  await waitVisible(feedingReminderCard);
  const feedingReminderToggle = visibleByTestId("record-alarm-toggle-feeding");
  if ((await feedingReminderToggle.getAttribute("aria-checked")) !== "true") {
    await feedingReminderToggle.click();
  }
  const feedingInterval = visibleByTestId("record-alarm-interval-feeding");
  await waitVisible(feedingInterval);
  await feedingInterval.fill("240");
  await visibleByTestId("record-alarm-scope-feeding-self").click();
  await page.screenshot({ path: "record-reminders.png", scale: "css" });
  await visibleByTestId("record-reminders-save").click();
  await page.getByText("기록 리마인더를 저장했어요.", { exact: true }).filter({ visible: true }).waitFor({ state: "visible", timeout: 25000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("screen-notification-settings"));
  await waitVisible(feedingReminderToggle);
  if ((await feedingReminderToggle.getAttribute("aria-checked")) !== "true") {
    throw new Error("수유 리마인더 설정이 저장 후 유지되지 않았습니다.");
  }
  await waitVisible(feedingInterval);
  if ((await feedingInterval.inputValue()) !== "240") {
    throw new Error("수유 리마인더 간격이 저장 후 유지되지 않았습니다.");
  }
  const selfScopeBackground = await visibleByTestId("record-alarm-scope-feeding-self").evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  if (selfScopeBackground !== "rgb(77, 182, 172)") {
    throw new Error(`수유 리마인더 수신 대상이 저장 후 유지되지 않았습니다: ${selfScopeBackground}`);
  }

  await page.goto(`${appOrigin}/settings`, { waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("screen-settings"));

  await page.getByText("앱 정보").filter({ visible: true }).first().click();
  await page.waitForURL("**/app-info", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-app-info"));
  await expectText("screen-app-info", ["아이로그", "버전", "이용약관", "개인정보 처리방침", "오픈소스 라이선스"]);

  await page.getByText("이용약관").filter({ visible: true }).first().click();
  await page.waitForURL("**/terms", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-terms"));
  await expectText("screen-terms", ["서비스 목적", "의료 진단", "정식 운영 전"]);
  await expectScrollable("screen-terms");

  await page.goto(`${appOrigin}/app-info`, { waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("screen-app-info"));
  await page.getByText("개인정보 처리방침").filter({ visible: true }).first().click();
  await page.waitForURL("**/privacy-policy", { timeout: 10000 });
  await waitVisible(page.getByTestId("screen-privacy-policy"));
  await expectText("screen-privacy-policy", ["처리 목적", "처리하는 정보", "Supabase", "Expo Push"]);
  await expectScrollable("screen-privacy-policy");

  await page.goto(`${appOrigin}/settings`, { waitUntil: "domcontentloaded" });
  await waitVisible(page.getByTestId("screen-settings"));
  await page.getByText("이 기기에서 로그아웃").filter({ visible: true }).first().click();
  await page.waitForURL("**/login", { timeout: 20000 });
  await waitVisible(page.getByTestId("screen-login"));
  await expectLoginBrandLogo();
  await expectText("screen-login", ["Sign in with Google", "Sign in with Apple"]);
  await expectGoogleButtonSoftFrame();
  await expectAppleButtonMatchesGoogleFrame();

  const dashboardAfterLogout = await page.getByTestId("screen-dashboard").count();
  if (dashboardAfterLogout > 0) {
    throw new Error("로그아웃 후 홈 화면이 남아 있습니다.");
  }

  if (supabaseRestFailures.length > 0) {
    throw new Error(`Supabase REST 요청이 실패했습니다: ${JSON.stringify(supabaseRestFailures)}`);
  }
}
