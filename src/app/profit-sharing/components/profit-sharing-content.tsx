
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { MonthlyProfit, ProfitShare } from "../actions";
import { getProfitSharesForMonth } from "../actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Loader2, Edit, Filter } from "lucide-react";
import SharesTable from "./shares-table";
import AddEditShareDialog from "./add-edit-share-dialog";
import AddManualProfitDialog from "./add-manual-profit-dialog";
import { format, parseISO } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

const StatCard = ({ title, value }: { title: string; value: string }) => (
    <div className="bg-muted/50 border p-4 rounded-lg text-center">
        <p className="text-sm text-muted-foreground font-bold">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
    </div>
);

interface PeriodRowProps {
  period: MonthlyProfit;
  partners: { id: string; name: string; type: string }[];
  onDataChange: () => void;
}

const PeriodRow = ({ period, partners, onDataChange }: PeriodRowProps) => {
    const [shares, setShares] = useState<ProfitShare[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const fetchShares = useCallback(async () => {
        if (isOpen) { // fetch only when opening
            setIsLoading(true);
            const fetchedShares = await getProfitSharesForMonth(period.id);
            // Enrich shares with partner names if they are missing
            const enrichedShares = produce(fetchedShares, draft => {
                draft.forEach(share => {
                    if (!share.partnerName) {
                        const partner = partners.find(p => p.id === share.partnerId);
                        if (partner) {
                            share.partnerName = partner.name;
                        }
                    }
                });
            });

            setShares(enrichedShares);
            setIsLoading(false);
        }
    }, [isOpen, period.id, partners]);

    useEffect(() => {
        if(isOpen) {
            fetchShares();
        }
    }, [isOpen, fetchShares]);

    const handleSuccess = () => {
        fetchShares(); // re-fetch shares for this specific row
        onDataChange(); // notify parent to refetch all periods if needed
    }

    const description = period.notes || (period.fromSystem ? `أرباح شهر ${period.id}` : 'فترة يدوية');
    const dateInfo = description.match(/من ([\d-]+) إلى ([\d-]+)/);
    let fromDate = period.fromSystem ? format(parseISO(`${period.id}-01`), 'yyyy-MM-dd') : (dateInfo ? dateInfo[1] : '-');
    let toDate = period.fromSystem ? '-' : (dateInfo ? dateInfo[2] : '-');

    return (
        <Collapsible asChild open={isOpen} onOpenChange={setIsOpen}>
             <tbody className="border-t">
                <TableRow className="cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
                    <TableCell className="p-2">
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                            </Button>
                        </CollapsibleTrigger>
                    </TableCell>
                    <TableCell className="font-semibold p-2">{description.split(' | ')[0]}</TableCell>
                    <TableCell className="p-2">{fromDate}</TableCell>
                    <TableCell className="p-2">{toDate}</TableCell>
                    <TableCell className="text-right font-mono font-bold p-2">{period.totalProfit.toLocaleString()} {period.currency || 'USD'}</TableCell>
                </TableRow>
                <CollapsibleContent asChild>
                    <TableRow>
                        <TableCell colSpan={5} className="p-0">
                            <div className="p-4 bg-muted/20">
                                {isLoading ? (
                                    <div className="flex justify-center p-8"><Loader2 className="animate-spin h-6 w-6"/></div>
                                ) : (
                                    <SharesTable 
                                        shares={shares}
                                        partners={partners}
                                        onDataChange={handleSuccess}
                                        totalProfit={period.totalProfit}
                                        currency={period.currency || 'USD'}
                                        isManual={!period.fromSystem}
                                        monthId={period.id}
                                    />
                                )}
                            </div>
                        </TableCell>
                    </TableRow>
                </CollapsibleContent>
            </tbody>
        </Collapsible>
    )
}

interface ProfitSharingContentProps {
  initialMonthlyProfits: MonthlyProfit[];
  partners: { id: string; name: string; type: string }[];
  onDataChange: () => void;
}

export default function ProfitSharingContent({ initialMonthlyProfits, partners, onDataChange }: ProfitSharingContentProps) {
  const [typeFilter, setTypeFilter] = useState<'all' | 'system' | 'manual'>('all');

  const filteredMonthlyProfits = useMemo(() => {
      if (typeFilter === 'all') return initialMonthlyProfits;
      return initialMonthlyProfits.filter(p => p.fromSystem === (typeFilter === 'system'));
  }, [initialMonthlyProfits, typeFilter]);
  
  const { totalDistributedProfit, totalCompanyShare, grandTotal } = useMemo(() => {
      let grandTotal = 0;
      let totalDistributed = 0;

      initialMonthlyProfits.forEach(p => {
          grandTotal += p.totalProfit;
          if (Array.isArray(p.partners)) {
             totalDistributed += p.partners.reduce((sum, partner) => sum + partner.amount, 0);
          }
      });
      return {
          grandTotal: grandTotal,
          totalDistributedProfit: totalDistributed,
          totalCompanyShare: grandTotal - totalDistributed
      };

  }, [initialMonthlyProfits]);

  return (
    <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="💰 إجمالي صافي الأرباح" value={`${grandTotal.toLocaleString()} USD`} />
            <StatCard title="📊 إجمالي حصص الشركاء الموزعة" value={`${totalDistributedProfit.toLocaleString()} USD`} />
            <StatCard title="🏢 إجمالي حصة الشركة" value={`${totalCompanyShare.toLocaleString()} USD`} />
        </div>

        <Card>
            <CardHeader className="flex flex-row justify-between items-center">
                <div>
                    <CardTitle>الفترات المحاسبية للأرباح</CardTitle>
                    <CardDescription>انقر على أي فترة لعرض توزيع حصصها.</CardDescription>
                </div>
                 <div className="flex items-center gap-2">
                    <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">الكل</SelectItem>
                            <SelectItem value="system">تلقائي</SelectItem>
                            <SelectItem value="manual">يدوي</SelectItem>
                        </SelectContent>
                    </Select>
                     <AddManualProfitDialog partners={partners} onSuccess={onDataChange} />
                </div>
            </CardHeader>
            <CardContent>
                 <div className="border rounded-lg overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px] p-2"></TableHead>
                                <TableHead className="p-2">الوصف</TableHead>
                                <TableHead className="p-2">تاريخ البدء</TableHead>
                                <TableHead className="p-2">تاريخ الانتهاء</TableHead>
                                <TableHead className="text-right p-2">إجمالي الربح</TableHead>
                            </TableRow>
                        </TableHeader>
                        {filteredMonthlyProfits.map((p, index) => (
                            <PeriodRow key={p.id} period={p} partners={partners} onDataChange={onDataChange} />
                        ))}
                    </Table>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
