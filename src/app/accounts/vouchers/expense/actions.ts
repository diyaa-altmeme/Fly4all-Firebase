
'use server';

import { getDb } from "@/lib/firebase-admin";
import { getCurrentUserFromSession } from "@/lib/auth/actions";
import { revalidatePath } from "next/cache";
import { getNextVoucherNumber } from "@/lib/sequences";
import { FieldValue } from "firebase-admin/firestore";
import { createAuditLog } from "@/app/system/activity-log/actions";
import { postJournalEntry } from "@/lib/finance/postJournal";

interface ExpenseVoucherData {
    date: string;
    expenseType: string;
    amount: number;
    currency: 'USD' | 'IQD';
    payee?: string;
    boxId: string;
    notes?: string;
    exchangeRate?: number;
}

export async function createExpenseVoucher(data: ExpenseVoucherData) {
    const user = await getCurrentUserFromSession();
    if (!user) {
        return { success: false, error: "User not authenticated." };
    }
    
    const db = await getDb();
    if (!db) {
        return { success: false, error: "Database not available." };
    }

    try {
        const voucherId = await postJournalEntry({
            sourceType: "manualExpense",
            sourceId: `expense-${Date.now()}`,
            description: `مصروف ${data.expenseType}: ${data.notes || ''}`.trim(),
            amount: data.amount,
            currency: data.currency,
            date: new Date(data.date),
            userId: user.uid,
            // Override default accounts
            debitAccountId: `expense_${data.expenseType}`, // Specific expense account
            creditAccountId: data.boxId, // Fund/box it was paid from
        });

        await createAuditLog({
            userId: user.uid,
            userName: user.name,
            action: 'CREATE',
            targetType: 'VOUCHER',
            description: `أنشأ سند مصاريف بمبلغ ${data.amount} ${data.currency}.`,
            targetId: voucherId
        });

        revalidatePath("/accounts/vouchers/list");
        revalidatePath("/reports/account-statement");

        return { success: true, voucherId };
    } catch (error: any) {
        console.error("Error creating expense voucher: ", String(error));
        return { success: false, error: error.message };
    }
}
