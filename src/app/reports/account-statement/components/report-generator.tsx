
"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Filter, FileText, Download, Printer, Plane, CreditCard, Repeat, Layers3, Share2, Wand2, AreaChart, Wallet, Boxes, FileUp, FileDown, BookUser, XCircle, RefreshCw, Banknote, GitBranch, ArrowRightLeft, ChevronsRightLeft, Building, Users, Terminal, Copy, AlertCircle } from "lucide-react";
import { Autocomplete } from "@/components/ui/autocomplete";
import { useToast } from "@/hooks/use-toast";
import { getAccountStatement } from "@/app/reports/actions";
import { DateRange } from "react-day-picker";
import { format, subDays, parseISO } from "date-fns";
import * as XLSX from "xlsx";
import ReportTable from "@/app/reports/account-statement/components/report-table";
import ReportFilters from "@/app/reports/account-statement/components/report-filters";
import ReportSummary from "@/app/reports/account-statement/components/report-summary";
import type { Box, Client, Supplier, ReportInfo, Currency, Exchange, ReportTransaction } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon } from 'lucide-react';
import { Separator } from "@/components/ui/separator";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useVoucherNav } from "@/context/voucher-nav-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ReportGeneratorProps {
  defaultAccountId?: string;
}

export default function ReportGenerator({ defaultAccountId }: ReportGeneratorProps) {
  const [report, setReport] = useState<ReportInfo | null>(null);
  const [transactions, setTransactions] = useState<ReportTransaction[]>([]);
  const { data: navData } = useVoucherNav();
  
  const [accountType, setAccountType] = useState<'relation' | 'box' | 'exchange' | 'static' | 'expense'>('relation');

  const [filters, setFilters] = useState({
    accountId: defaultAccountId || "",
    dateRange: { from: subDays(new Date(), 30), to: new Date() } as DateRange | undefined,
    searchTerm: "",
    currency: "both" as Currency | "both",
    typeFilter: new Set<string>(),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  
  const firestoreIndexUrl = error && error.startsWith('FIRESTORE_INDEX_URL::') ? error.split('::')[1] : null;


  const allAccounts = useMemo(() => {
    if(!navData) return [];
    switch (accountType) {
        case 'box':
            return navData.boxes.map(b => ({ value: b.id, label: b.name }));
        case 'exchange':
            return navData.exchanges.map(ex => ({ value: ex.id, label: ex.name }));
        case 'expense':
            return navData.settings?.voucherSettings?.expenseAccounts?.map(e => ({ value: `expense_${e.id}`, label: e.name })) || [];
        case 'static':
            return [
                { value: "revenue_segments", label: "إيراد: السكمنت" },
                { value: "revenue_profit_distribution", label: "إيراد: توزيع الأرباح" },
                { value: "revenue_tickets", label: "إيرادات التذاكر" },
                { value: "revenue_visa", label: "إيرادات الفيزا" },
                { value: "expense_tickets", label: "تكلفة التذاكر" },
                { value: "expense_visa", label: "تكلفة الفيزا" },
            ];
        case 'relation':
        default:
            const clientOptions = (navData.clients || []).map(c => ({ value: c.id, label: `عميل: ${c.name}` }));
            const supplierOptions = (navData.suppliers || []).map(s => ({ value: s.id, label: `مورد: ${s.name}` }));
            return [...clientOptions, ...supplierOptions];
    }
  }, [accountType, navData]);

   const allFilters = useMemo(() => [
        { id: 'booking', label: 'حجز طيران', icon: Plane, group: 'basic' },
        { id: 'visa', label: 'طلب فيزا', icon: CreditCard, group: 'basic' },
        { id: 'subscription', label: 'اشتراك', icon: Repeat, group: 'basic' },
        { id: 'payment', label: 'سند دفع', icon: FileUp, group: 'basic' },
        { id: 'standard_receipt', label: 'سند قبض', icon: FileDown, group: 'basic' },
        { id: 'manualExpense', label: 'سند مصاريف', icon: Banknote, group: 'basic' },
        { id: 'distributed_receipt', label: 'سند قبض مخصص', icon: GitBranch, group: 'other' },
        { id: 'remittance', label: 'حوالة مستلمة', icon: ArrowRightLeft, group: 'other' },
        { id: 'exchange_transaction', label: 'معاملة بورصة', icon: ChevronsRightLeft, group: 'other' },
        { id: 'exchange_payment', label: 'تسديد بورصة', icon: ChevronsRightLeft, group: 'other' },
        { id: 'segment', label: 'سكمنت', icon: Layers3, group: 'other' },
        { id: 'profit-sharing', label: 'توزيع الحصص', icon: Share2, group: 'other' },
        { id: 'journal_voucher', label: 'قيد محاسبي', icon: BookUser, group: 'other' },
        { id: 'refund', label: 'استرجاع تذكرة', icon: RefreshCw, group: 'other' },
        { id: 'exchange', label: 'تغيير تذكرة', icon: RefreshCw, group: 'other' },
        { id: 'void', label: 'إلغاء (فويد)', icon: XCircle, group: 'other' },
    ], []);
    
    useEffect(() => {
        setFilters(f => ({ ...f, typeFilter: new Set(allFilters.map(filter => filter.id)) }));
    }, [allFilters]);

  const handleGenerateReport = useCallback(async () => {
    if (!filters.accountId) {
      toast({ title: "خطأ", description: "الرجاء اختيار حساب.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setReport(null);
    setTransactions([]);
    setError(null);

    try {
      const data = await getAccountStatement({
        accountId: filters.accountId,
        dateFrom: filters.dateRange?.from,
        dateTo: filters.dateRange?.to,
        voucherType: Array.from(filters.typeFilter),
      });
      
      const transactionsData = Array.isArray(data) ? data : [];
      setTransactions(transactionsData);

      if (transactionsData.length > 0) {
          let totalDebitUSD = 0;
          let totalCreditUSD = 0;
          let totalDebitIQD = 0;
          let totalCreditIQD = 0;

          transactionsData.forEach(tx => {
              if (tx.currency === 'USD') {
                  totalDebitUSD += tx.debit;
                  totalCreditUSD += tx.credit;
              } else {
                   totalDebitIQD += tx.debit;
                  totalCreditIQD += tx.credit;
              }
          });
          
          const lastTransactionUSD = [...transactionsData].reverse().find(tx => tx.currency === 'USD');
          const lastTransactionIQD = [...transactionsData].reverse().find(tx => tx.currency === 'IQD');


          setReport({
              transactions: transactionsData,
              openingBalanceUSD: 0, 
              openingBalanceIQD: 0,
              totalDebitUSD,
              totalCreditUSD,
              finalBalanceUSD: lastTransactionUSD?.balance || 0,
              totalDebitIQD,
              totalCreditIQD,
              finalBalanceIQD: lastTransactionIQD?.balance || 0,
              title: '',
              currency: filters.currency,
              accountType: '' as any,
              balanceMode: 'asset',
          });
      }

    } catch (error: any) {
      setError(error.message);
      setTransactions([]);
      if (!error.message.startsWith('FIRESTORE_INDEX_URL::')) {
          toast({ title: "فشل", description: error.message, variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    if (defaultAccountId) {
        handleGenerateReport();
    }
  }, [defaultAccountId, handleGenerateReport]);


  const handleExport = () => {
    if (!transactions || transactions.length === 0) {
      toast({ title: "لا توجد بيانات للتصدير", variant: "destructive" });
      return;
    }
    const data = transactions.map(tx => ({
      'التاريخ': tx.date ? format(parseISO(tx.date), "yyyy-MM-dd") : "",
      'النوع': tx.type,
      'البيان': typeof tx.description === 'string' ? tx.description : tx.description?.title,
      'مدين': tx.debit,
      'دائن': tx.credit,
      'الرصيد': tx.balance,
      'العملة': tx.currency,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كشف الحساب");
    const accountName = allAccounts.find(a => a.value === filters.accountId)?.label || "Account";
    XLSX.writeFile(wb, `Statement-${accountName.replace(/:/g, '')}-${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "تم التصدير بنجاح" });
  };

  const handlePrint = () => window.print();
  
  const finalTransactions = useMemo(() => {
    if (!filters.searchTerm) return transactions;
    return transactions.filter(tx => 
        (tx.description && (typeof tx.description === 'string' ? tx.description : tx.description.title)?.toLowerCase().includes(filters.searchTerm.toLowerCase())) ||
        tx.invoiceNumber?.toLowerCase().includes(filters.searchTerm.toLowerCase())
    );
  }, [transactions, filters.searchTerm]);

  const handleCopyIndexUrl = () => {
      if (firestoreIndexUrl) {
          navigator.clipboard.writeText(firestoreIndexUrl);
          toast({ title: "تم نسخ الرابط بنجاح!", description: "الرجاء فتح الرابط في متصفح جديد لإنشاء الفهرس."});
      }
  }

  return (
     <div className="flex flex-col lg:flex-row h-full lg:h-[calc(100vh-210px)] gap-4">
      <aside className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4 lg:sticky top-20">
        <Card>
          <CardHeader>
            <CardTitle>خيارات العرض</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
                <Label className="font-semibold">نوع الحساب</Label>
                <Select value={accountType} onValueChange={v => {setAccountType(v as any); setFilters(f => ({...f, accountId: ''}))}}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="relation"><div className="flex items-center gap-2"><Users className="h-4 w-4"/>عميل / مورد</div></SelectItem>
                        <SelectItem value="box"><div className="flex items-center gap-2"><Wallet className="h-4 w-4"/>صندوق</div></SelectItem>
                        <SelectItem value="exchange"><div className="flex items-center gap-2"><Building className="h-4 w-4"/>بورصة</div></SelectItem>
                        <SelectItem value="expense"><div className="flex items-center gap-2"><Banknote className="h-4 w-4"/>مصروف</div></SelectItem>
                        <SelectItem value="static"><div className="flex items-center gap-2"><FileText className="h-4 w-4"/>حساب عام</div></SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">الحساب</Label>
              <Autocomplete
                value={filters.accountId}
                onValueChange={(v) => setFilters(f => ({ ...f, accountId: v }))}
                options={allAccounts}
                placeholder="اختر حسابًا..."
              />
            </div>
             <div className="space-y-2">
                <Label className="font-semibold">الفترة الزمنية</Label>
                 <div className="grid grid-cols-2 gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("justify-start text-left font-normal", !filters.dateRange?.from && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {filters.dateRange?.from ? format(filters.dateRange.from, "yyyy-MM-dd") : <span>من تاريخ</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={filters.dateRange?.from} onSelect={(d) => setFilters(f => ({ ...f, dateRange: { ...f.dateRange, from: d } }))} initialFocus />
                        </PopoverContent>
                    </Popover>
                     <Popover>
                        <PopoverTrigger asChild>
                             <Button variant="outline" className={cn("justify-start text-left font-normal", !filters.dateRange?.to && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {filters.dateRange?.to ? format(filters.dateRange.to, "yyyy-MM-dd") : "إلى تاريخ"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={filters.dateRange?.to} onSelect={(d) => setFilters(f => ({ ...f, dateRange: { ...f.dateRange, to: d } }))} initialFocus />
                        </PopoverContent>
                    </Popover>
                </div>
              </div>
            <Button onClick={handleGenerateReport} disabled={isLoading} className="w-full">
              {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              <Filter className="me-2 h-4 w-4" />
              عرض الكشف
            </Button>
            <Separator />
            <ReportFilters filters={filters} onFiltersChange={setFilters} allFilters={allFilters} />
          </CardContent>
        </Card>
      </aside>

      <div className="flex-1 flex flex-col bg-card rounded-lg shadow-sm overflow-hidden">
        <header className="flex items-center justify-between p-3 border-b">
          <div className="flex gap-2">
            <Button onClick={handleExport} variant="outline" disabled={transactions.length === 0}><Download className="me-2 h-4 w-4"/>Excel</Button>
            <Button onClick={handlePrint} variant="outline" disabled={transactions.length === 0}><Printer className="me-2 h-4 w-4"/>طباعة</Button>
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث في النتائج..."
              value={filters.searchTerm}
              onChange={e => setFilters(f => ({ ...f, searchTerm: e.target.value }))}
              className="ps-10 h-9"
            />
          </div>
        </header>
        <div className="flex-grow overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : error ? (
            <div className="p-8">
               <Alert variant="destructive">
                <Terminal className="h-4 w-4" />
                <AlertTitle>حدث خطأ في قاعدة البيانات!</AlertTitle>
                <AlertDescription>
                    <p>يتطلب هذا الاستعلام إنشاء فهرس مركب في Firestore. بدون هذا الفهرس، لا يمكن جلب البيانات.</p>
                    {firestoreIndexUrl && (
                        <div className="mt-4">
                            <Button onClick={handleCopyIndexUrl}>
                                <Copy className="me-2 h-4 w-4" />
                                نسخ رابط إنشاء الفهرس
                            </Button>
                        </div>
                    )}
                </AlertDescription>
            </Alert>
            </div>
          ) : (
            <ReportTable transactions={finalTransactions} onRefresh={handleGenerateReport} />
          )}
        </div>
        <footer className="p-3 border-t bg-card">
            {report && <ReportSummary report={report} />}
        </footer>
      </div>
    </div>
  );
}

    