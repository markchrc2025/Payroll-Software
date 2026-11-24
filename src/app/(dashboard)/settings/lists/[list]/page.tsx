"use client";

/**
 * One company list on its own page. The editor lives in
 * src/components/settings/ListEditor.tsx; the Settings hub's Lists page
 * (/setup/lists) shows every list as a tab.
 */
import { use } from "react";
import { ListEditor } from "@/components/settings/ListEditor";

export default function ListPage({ params }: { params: Promise<{ list: string }> }) {
  const { list } = use(params);
  return <ListEditor list={list} />;
}
