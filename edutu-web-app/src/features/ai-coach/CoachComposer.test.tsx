import "../../i18n";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CoachComposer from "./CoachComposer";

afterEach(() => vi.unstubAllGlobals());

it("keeps Enter as a newline action on touch keyboards", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const onSend = vi.fn();
  render(<CoachComposer value="Find a scholarship" onChange={vi.fn()} busy={false} onSend={onSend} onStop={vi.fn()} />);

  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(onSend).not.toHaveBeenCalled();
});

it("lets keyboard users submit with Enter on desktop", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const onSend = vi.fn();
  render(<CoachComposer value="Review my application" onChange={vi.fn()} busy={false} onSend={onSend} onStop={vi.fn()} />);

  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(onSend).toHaveBeenCalledOnce();
});

it("allows clearing an unsent message without submitting it", () => {
  const onSend = vi.fn();
  function TestComposer() {
    const [value, setValue] = useState("Draft question");
    return <CoachComposer value={value} onChange={setValue} busy={false} onSend={onSend} onStop={vi.fn()} />;
  }
  render(<TestComposer />);

  fireEvent.click(screen.getByRole("button", { name: /clear message/i }));
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(onSend).not.toHaveBeenCalled();
});
