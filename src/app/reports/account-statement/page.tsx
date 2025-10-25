
"use client";

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import ReportGenerator from '@/app/reports/account-statement/components/report-generator';
import { useVoucherNav } from '@/context/voucher-nav-context';
import { Skeleton } from '@/components/ui/skeleton';

function AccountStatementPageContent() {
    const searchParams = useSearchParams();
    const defaultAccountId = searchParams.get('accountId') || '';
    const { data: navData, loaded: navLoaded } = useVoucherNav();
    
    if (!navLoaded || !navData) {
        return (
            <div className="p-4">
                <Skeleton className="h-[60vh] w-full" />
            </div>
        )
    }

    return (
        <ReportGenerator 
            defaultAccountId={defaultAccountId}
            boxes={navData.boxes || []}
            clients={navData.clients || []}
            suppliers={navData.suppliers || []}
            exchanges={navData.exchanges || []}
        />
    )
}

export default function AccountStatementPage() {
    return (
        <div className="space-y-6">
            <Card>
                 <CardHeader>
                    <CardTitle>كشف الحساب</CardTitle>
                    <CardDescription>
                        عرض وتحليل جميع الحركات المالية لحساب محدد ضمن فترة زمنية.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
                        <AccountStatementPageContent />
                    </Suspense>
                </CardContent>
            </Card>
        </div>
    )
}

    