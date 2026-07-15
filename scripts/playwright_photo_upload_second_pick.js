async (page) => {
  const addButton = page.getByTestId("photo-album-add");
  await addButton.waitFor({ state: "visible", timeout: 25000 });
  await addButton.click();
}
