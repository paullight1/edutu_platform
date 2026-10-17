import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Pagination from "./Pagination";

describe("Pagination", () => {
  it("renders real links when a page href builder is supplied", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={2}
        totalPages={4}
        onPageChange={onPageChange}
        getPageHref={(page) => (page === 1 ? "/blog" : `/blog?page=${page}`)}
      />,
    );

    expect(screen.getByRole("link", { name: "Previous page" })).toHaveAttribute(
      "href",
      "/blog",
    );
    expect(screen.getByRole("link", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      "/blog?page=3",
    );

    fireEvent.click(screen.getByRole("link", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("allows modified link clicks to use normal browser navigation", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={2}
        totalPages={3}
        onPageChange={onPageChange}
        getPageHref={(page) => `/blog?page=${page}`}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "Next page" }), {
      ctrlKey: true,
    });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("preserves button mode for existing non-addressable callers", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination page={1} totalPages={2} onPageChange={onPageChange} />,
    );

    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("clamps stale or malformed page numbers to valid navigation", () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <Pagination
        page={999}
        totalPages={3}
        onPageChange={onPageChange}
        getPageHref={(page) => `/blog?page=${page}`}
      />,
    );

    expect(screen.getByRole("link", { name: "Page 3" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("link", { name: "Previous page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    rerender(
      <Pagination
        page={0}
        totalPages={3}
        onPageChange={onPageChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
