import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/components/auth-provider";
import type { AuthSession } from "@/lib/auth";
import { clearCsrfToken } from "@/lib/api";
import ProfilePage from "@/app/profile/page";

const back = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ back, push }) }));

const session: AuthSession = {
  user: {
    id: "volunteer-1",
    email_normalized: "mia@example.test",
    display_name: "Mia",
    status: "ACTIVE",
  },
  memberships: [],
};

const profile = {
  first_name: "Mia",
  last_name: "Muster",
  phone: "+41 79 123 45 67",
  email: "mia@example.test",
  compensation_preference: "VOLUNTARY" as const,
  compensation_family_member_id: null,
  compensation_family_member_name: null,
  upcoming_signups: [],
  completed_signups: [],
  family_children: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearCsrfToken();
});

describe("ProfilePage back navigation", () => {
  beforeEach(() => {
    Object.defineProperty(window, "history", {
      value: { length: 2 },
      writable: true,
      configurable: true,
    });
  });

  it("renders a visible, accessible back control once the profile has loaded and it navigates back", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ csrf_token: "token" }))
      .mockResolvedValueOnce(Response.json(profile));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const backButton = await screen.findByRole("button", { name: "Zurück" });
    expect(backButton).toBeVisible();
    fireEvent.click(backButton);
    expect(back).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("falls back to the landing page when there is no browser history to go back to", async () => {
    Object.defineProperty(window, "history", {
      value: { length: 1 },
      writable: true,
      configurable: true,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ csrf_token: "token" }))
      .mockResolvedValueOnce(Response.json(profile));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const backButton = await screen.findByRole("button", { name: "Zurück" });
    fireEvent.click(backButton);
    expect(push).toHaveBeenCalledWith("/");
    expect(back).not.toHaveBeenCalled();
  });

  it("also offers a back control on the unauthenticated state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );
    const backButton = await screen.findByRole("button", { name: "Zurück" });
    fireEvent.click(backButton);
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
  });
});
