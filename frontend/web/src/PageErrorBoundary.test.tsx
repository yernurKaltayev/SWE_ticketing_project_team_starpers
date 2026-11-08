// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { PageErrorBoundary } from "./PageErrorBoundary";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
let fail = true;
function BrokenPage() {
  if (fail) throw new Error("Controlled render failure");
  return <h1>Recovered page</h1>;
}
function Shell() {
  const location = useLocation();
  return (
    <>
      <header>
        <Link to="/events">Events navigation</Link>
      </header>
      <PageErrorBoundary
        key={location.key}
        locale="en"
        navigation={<Link to="/events">Back to events</Link>}
      >
        <Routes>
          <Route path="/broken" element={<BrokenPage />} />
          <Route path="/events" element={<h1>Events page</h1>} />
        </Routes>
      </PageErrorBoundary>
    </>
  );
}
it("keeps navigation visible after a render failure and retries without replaying any write", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  fail = true;
  render(
    <MemoryRouter initialEntries={["/broken"]}>
      <Shell />
    </MemoryRouter>,
  );
  const heading = await screen.findByRole("heading", {
    name: "This page couldn’t open",
  });
  expect(document.activeElement).toBe(heading);
  expect(screen.getByRole("link", { name: "Events navigation" })).toBeDefined();
  fail = false;
  await userEvent.click(
    screen.getByRole("button", { name: "Try opening this page again" }),
  );
  await screen.findByRole("heading", { name: "Recovered page" });
});
it("resets the failed page when the user navigates away", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  fail = true;
  render(
    <MemoryRouter initialEntries={["/broken"]}>
      <Shell />
    </MemoryRouter>,
  );
  await screen.findByRole("alert");
  await userEvent.click(
    screen.getByRole("link", { name: "Events navigation" }),
  );
  await screen.findByRole("heading", { name: "Events page" });
  expect(screen.queryByRole("alert")).toBeNull();
});
