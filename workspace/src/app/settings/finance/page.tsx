
"use client";

import React, { useEffect, useState, useMemo } from "react";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppSettings, TreeNode } from '@/lib/types';
import { getSettings, updateSettings } from '@/app/settings/actions';
import { getChartOfAccounts } from '../accounting/actions';
import { useVoucherNav } from "@/context/voucher-nav-context";


interface Account {
  id: string;
  name: string;
  type: "asset" | "liability" | "income" | "expense";
}

interface FinanceSettings {
  defaultReceivableAccount?: string;
  defaultPayableAccount?: string;
  defaultRevenueAccount?: string;
  defaultExpenseAccount?: string;
  defaultCashAccount?: string;
  defaultBankAccount?: string;
  preventDirectCashRevenue?: boolean;
  revenueMap?: Record<string, string>;
}

export default function FinanceControlCenter() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<FinanceSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { data: navData, fetchData } = useVoucherNav();
  const expenseAccountsFromSettings = navData?.settings?.voucherSettings?.expenseAccounts || [];

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const chart = await getChartOfAccounts();
        
        const flatten = (nodes: TreeNode[]): Account[] => {
            let flatList: Account[] = [];
            nodes.forEach(node => {
                if (node.children?.length > 0) {
                    flatList.push({ id: node.id, name: node.name, type: node.type as any });
                    flatList = [...flatList, ...flatten(node.children)];
                } else if(node.type !== 'asset' && node.type !== 'liability') {
                    flatList.push({ id: node.id, name: node.name, type: node.type as any });
                }
            });
            return flatList;
        }

        const accs = flatten(chart);
        setAccounts(accs);

        const settingsSnap = await getDoc(doc(db, "settings", "app"));
        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          setSettings(data.financeAccountsSettings || {});
        }
      } catch (err: any) {
        console.error("Error loading finance data:", err);
        toast({
          title: "فشل التحميل",
          description: "لا يمكن تحميل البيانات المالية من قاعدة البيانات.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({ financeAccounts: settings });
      toast({
        title: "تم الحفظ بنجاح ✅",
        description: "تم تحديث إعدادات مركز التحكم المالي.",
      });
      fetchData(true);
    } catch (err: any) {
      console.error("Error saving settings:", err);
      toast({
        title: "فشل الحفظ",
        description: "حدث خطأ أثناء حفظ الإعدادات.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: keyof FinanceSettings, value: string | boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };
  
  const handleRevenueMapChange = (category: string, accountId: string) => {
    setSettings(prev => ({
      ...prev,
      revenueMap: {
        ...(prev.revenueMap || {}),
        [category]: accountId,
      }
    }));
  };


  const filteredAccounts = useMemo(() => ({
    assets: accounts.filter((a) => a.type === "asset"),
    liabilities: accounts.filter((a) => a.type === "liability"),
    income: accounts.filter((a) => a.type === "income"),
    expense: accounts.filter((a) => a.type === "expense"),
    cash: accounts.filter((a) => a.name.includes("صندوق") || a.name.includes("cash")),
    bank: accounts.filter((a) => a.name.includes("بنك") || a.name.includes("bank")),
  }), [accounts]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t pt-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-6 w-12" />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Skeleton className="h-10 w-28" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>⚙️ مركز التحكم المالي</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            حدد الحسابات الافتراضية للنظام واربطها مع العمليات المالية في شجرة الحسابات.
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AccountSelect
              label="حساب الذمم المدينة (العملاء)"
              value={settings.defaultReceivableAccount || ""}
              onValueChange={(v) => handleChange("defaultReceivableAccount", v)}
              accounts={filteredAccounts.assets}
            />
            <AccountSelect
              label="حساب الذمم الدائنة (الموردين)"
              value={settings.defaultPayableAccount || ""}
              onValueChange={(v) => handleChange("defaultPayableAccount", v)}
              accounts={filteredAccounts.liabilities}
            />
            <AccountSelect
              label="حساب الإيرادات العامة"
              value={settings.defaultRevenueAccount || ""}
              onValueChange={(v) => handleChange("defaultRevenueAccount", v)}
              accounts={filteredAccounts.income}
            />
            <AccountSelect
              label="حساب المصروفات العامة"
              value={settings.defaultExpenseAccount || ""}
              onValueChange={(v) => handleChange("defaultExpenseAccount", v)}
              accounts={filteredAccounts.expense}
            />
            <AccountSelect
              label="الصندوق الافتراضي"
              value={settings.defaultCashAccount || ""}
              onValueChange={(v) => handleChange("defaultCashAccount", v)}
              accounts={filteredAccounts.cash}
            />
            <AccountSelect
              label="الحساب البنكي الافتراضي"
              value={settings.defaultBankAccount || ""}
              onValueChange={(v) => handleChange("defaultBankAccount", v)}
              accounts={filteredAccounts.bank}
            />
          </div>

          <div className="space-y-4 pt-4 border-t">
              <h4 className="font-semibold">ربط الإيرادات بحسابات مخصصة</h4>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <AccountSelect label="إيرادات التذاكر" value={settings.revenueMap?.['tickets'] || ''} onValueChange={v => handleRevenueMapChange('tickets', v)} accounts={filteredAccounts.income} />
                  <AccountSelect label="إيرادات الفيزا" value={settings.revenueMap?.['visas'] || ''} onValueChange={v => handleRevenueMapChange('visas', v)} accounts={filteredAccounts.income} />
                  <AccountSelect label="إيرادات الاشتراكات" value={settings.revenueMap?.['subscriptions'] || ''} onValueChange={v => handleRevenueMapChange('subscriptions', v)} accounts={filteredAccounts.income} />
                  <AccountSelect label="إيرادات السكمنت" value={settings.revenueMap?.['segments'] || ''} onValueChange={v => handleRevenueMapChange('segments', v)} accounts={filteredAccounts.income} />
              </div>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <Label htmlFor="prevent-profit-cash">منع تسجيل الأرباح مباشرة في الصندوق</Label>
            <Switch
              id="prevent-profit-cash"
              checked={settings.preventDirectCashRevenue || false}
              onCheckedChange={(v) => handleChange("preventDirectCashRevenue", v)}
            />
          </div>
        </CardContent>

        <CardFooter className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جارٍ الحفظ..." : "💾 حفظ الإعدادات"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

interface AccountSelectProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  accounts: Account[];
}

function AccountSelect({ label, value, onValueChange, accounts }: AccountSelectProps) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger><SelectValue placeholder="اختر حساب..." /></SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
