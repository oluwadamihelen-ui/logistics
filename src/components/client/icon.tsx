"use client";
import {
  LayoutDashboard, Package, Send, Map, Route, Warehouse, Users, IdCard, Truck, Banknote, Receipt, Wallet, HandCoins, Tag,
  BarChart3, FileText, Sparkles, Bell, LifeBuoy, Boxes, UserCog, Folder, Shield, Settings, CreditCard, Search, Menu, LogOut,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard, package: Package, send: Send, map: Map, route: Route, warehouse: Warehouse, users: Users,
  "id-card": IdCard, truck: Truck, banknote: Banknote, receipt: Receipt, wallet: Wallet, "hand-coins": HandCoins, tag: Tag,
  "bar-chart": BarChart3, "file-text": FileText, sparkles: Sparkles, bell: Bell, "life-buoy": LifeBuoy, boxes: Boxes,
  "user-cog": UserCog, folder: Folder, shield: Shield, settings: Settings, "credit-card": CreditCard, search: Search, menu: Menu, logout: LogOut,
};

export function Icon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const C = ICONS[name] ?? Package;
  return <C className={className} aria-hidden />;
}
