"use client";
import { driverCompleteAction, driverFailAction, driverTransitionAction } from "@/app/driver/actions";
import type { Senders } from "./offline-queue";

export const senders: Senders = {
  transition: (p) => driverTransitionAction(p),
  complete: (p) => driverCompleteAction(p),
  fail: (p) => driverFailAction(p),
};
