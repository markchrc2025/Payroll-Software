"use client";

/**
 * Desktop ESS navigation context. The desktop shell keeps an in-memory
 * { page, param } route (top-nav + in-page links) plus the global clock modal
 * and the shared clocked-in flag, exposed to every D* screen via this context.
 */

import { createContext } from "react";

export type DPage =
  | "dashboard"
  | "pay"
  | "leave"
  | "time"
  | "profile"
  | "dtr"
  | "dtr-detail";

export type DModal = "clock-in" | "clock-out" | "leave" | null;

export interface DNavValue {
  page: DPage;
  go: (page: DPage, param?: string | null) => void;
  openModal: (m: Exclude<DModal, null>) => void;
  closeModal: () => void;
  clockedIn: boolean;
  setClockedIn: (v: boolean) => void;
  logout: () => void;
}

export const DNav = createContext<DNavValue>({
  page: "dashboard",
  go: () => {},
  openModal: () => {},
  closeModal: () => {},
  clockedIn: false,
  setClockedIn: () => {},
  logout: () => {},
});
