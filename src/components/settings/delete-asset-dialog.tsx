
"use client";

import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SiteAsset } from '@/lib/types';
import { permanentDeleteAsset } from '@/app/settings/assets/actions';

interface DeleteAssetDialogProps {
  asset: SiteAsset;
  onAssetDeleted: () => void;
  children: React.ReactNode;
}

export default function DeleteAssetDialog({ asset, onAssetDeleted, children }: DeleteAssetDialogProps) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await permanentDeleteAsset(asset);
    
    if (result.success) {
      toast({ title: "تم حذف الأصل بنجاح" });
      onAssetDeleted();
      setOpen(false);
    } else {
      toast({
        title: "خطأ",
        description: result.error || "حدث خطأ أثناء حذف الأصل.",
        variant: "destructive",
      });
    }
    setIsDeleting(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
          <AlertDialogDescription>
            هذا الإجراء لا يمكن التراجع عنه. سيؤدي هذا إلى حذف الأصل بشكل دائم من الخادم.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}>
            {isDeleting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Trash2 className="me-2 h-4 w-4" />}
            نعم، قم بالحذف النهائي
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
