
      "use client";

import React, { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useVoucherNav } from "@/context/voucher-nav-context";
import { NumericInput } from "@/components/ui/numeric-input";
import { Autocomplete } from "@/components/ui/autocomplete";
import { addSegmentEntries } from "@/app/segments/actions";
import {
  PlusCircle, Trash2, Percent, Loader2, Ticket, CreditCard, Hotel, Users as GroupsIcon, ArrowDown, Save, Pencil, Building, User as UserIcon, Wallet, Hash, AlertTriangle, CheckCircle, ArrowRight, X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { FormProvider, useForm, useFieldArray, Controller, useWatch, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Client, Supplier, SegmentSettings, SegmentEntry, PartnerShareSetting, Currency } from '@/lib/types';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { useAuth } from '@/lib/auth-context';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Stepper, StepperItem, useStepper } from '@/components/ui/stepper';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';


const companyEntrySchema = z.object({
  id: z.string(),
  clientId: z.string().min(1, { message: "اسم الشركة مطلوب." }),
  clientName: z.string().min(1),
  tickets: z.coerce.number().int().nonnegative().default(0),
  visas: z.coerce.number().int().nonnegative().default(0),
  hotels: z.coerce.number().int().nonnegative().default(0),
  groups: z.coerce.number().int().nonnegative().default(0),
  notes: z.string().optional(),
  // Profit settings
  ticketProfitType: z.enum(['fixed', 'percentage']).default('percentage'),
  ticketProfitValue: z.coerce.number().min(0).default(50),
  visaProfitType: z.enum(['fixed', 'percentage']).default('percentage'),
  visaProfitValue: z.coerce.number().min(0).default(100),
  hotelProfitType: z.enum(['fixed', 'percentage']).default('percentage'),
  hotelProfitValue: z.coerce.number().min(0).default(100),
  groupProfitType: z.enum(['fixed', 'percentage']).default('percentage'),
  groupProfitValue: z.coerce.number().min(0).default(100),
});

const partnerSchema = z.object({
  id: z.string(),
  partnerId: z.string().min(1, "اختر شريكاً."),
  partnerName: z.string(),
  percentage: z.coerce.number().min(0, "النسبة يجب أن تكون موجبة.").max(100, "النسبة لا تتجاوز 100."),
  amount: z.coerce.number(), // This field is for calculation display, not direct input
});

const periodSchema = z.object({
  fromDate: z.date({ required_error: "تاريخ البدء مطلوب." }).nullable(),
  toDate: z.date({ required_error: "تاريخ الانتهاء مطلوب." }).nullable(),
  entryDate: z.date({ required_error: "تاريخ الإضافة مطلوب." }),
  currency: z.string().min(1, "اختر العملة."),
  hasPartner: z.boolean().default(false),
  alrawdatainSharePercentage: z.coerce.number().min(0).max(100).default(100),
  partners: z.array(partnerSchema).optional(),
  summaryEntries: z.array(z.any()).min(1, "يجب إضافة شركة واحدة على الأقل."),
});


type CompanyEntryFormValues = z.infer<typeof companyEntrySchema>;
type PeriodFormValues = z.infer<typeof periodSchema>;
export type PartnerShare = z.infer<typeof partnerSchema>;

// Helpers
function computeService(count: number, type: "fixed" | "percentage", value: number): number {
  if (!count || !value) return 0;
  return type === "fixed" ? count * value : count * (value / 100);
}

function computeCompanyTotal(d: any, companySettings?: Partial<SegmentSettings>) {
    const settings = companySettings || {};
    return [
      computeService(d.tickets, d.ticketProfitType || 'percentage', d.ticketProfitValue || 50),
      computeService(d.visas, d.visaProfitType || 'percentage', d.visaProfitValue || 100),
      computeService(d.hotels, d.hotelProfitType || 'percentage', d.hotelProfitValue || 100),
      computeService(d.groups, d.groupProfitType || 'percentage', d.groupProfitValue || 100)
    ].reduce((sum, val) => sum + val, 0);
  }

// Sub-components
const ServiceLine = ({ label, icon: Icon, color, countField, typeField, valueField }: any) => {
  const { control, watch } = useFormContext<CompanyEntryFormValues>();
  const count = watch(countField);
  const type = watch(typeField);
  const value = watch(valueField);

  const result = useMemo(() => computeService(count, type, value), [count, type, value]);
  const currency = useFormContext<PeriodFormValues>().watch('currency');

  return (
    <Card className="shadow-sm overflow-hidden" style={{ borderColor: `hsl(var(--${color}))`}}>
      <CardHeader className="p-2 flex flex-row items-center justify-between space-y-0 text-white" style={{ backgroundColor: `hsl(var(--${color}))`}}>
        <CardTitle className="text-xs font-bold flex items-center gap-1.5"><Icon className="h-4 w-4" />{label}</CardTitle>
        <div className="text-xs font-bold font-mono px-1.5 py-0.5 bg-background/20 rounded-md">{result.toFixed(2)}</div>
      </CardHeader>
      <CardContent className="p-2 pt-1 space-y-1">
        <Controller control={control} name={countField} render={({ field }) => (<div><Label className="sr-only">العدد</Label><NumericInput {...field} onValueChange={(v) => field.onChange(v || 0)} placeholder="العدد" className="h-8 text-center font-semibold text-sm" /></div>)} />
        <div className="flex gap-1">
            <Controller control={control} name={typeField} render={({ field }) => (
                <FormItem>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-7 w-16 text-xs"><SelectValue/></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="percentage">%</SelectItem>
                        <SelectItem value="fixed">$</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
            )}/>
             <Controller control={control} name={valueField} render={({ field }) => (<NumericInput currency={currency as Currency} currencyClassName={cn(currency === 'USD' ? 'bg-accent text-accent-foreground' : 'bg-primary text-primary-foreground')} {...field} onValueChange={(v) => field.onChange(v || 0)} placeholder="القيمة" className="h-7 text-xs" />)} />
        </div>
      </CardContent>
    </Card>
  );
};

interface AddCompanyToSegmentFormProps {
    onAdd: (data: any) => void;
    allCompanyOptions: { value: string; label: string; settings?: Partial<SegmentSettings> }[];
    partnerOptions: { value: string; label: string }[];
    editingEntry?: any;
    onCancelEdit: () => void;
}

const AddCompanyToSegmentForm = forwardRef(({ onAdd, allCompanyOptions, partnerOptions, editingEntry, onCancelEdit }: AddCompanyToSegmentFormProps, ref) => {
    const { getValues: getPeriodValues } = useFormContext<PeriodFormValues>();
    
    const form = useForm<CompanyEntryFormValues>({
        resolver: zodResolver(companyEntrySchema),
    });
    
    const { reset, control, handleSubmit, watch, setValue } = form;

    React.useEffect(() => {
        const defaultValues = { id: uuidv4(), clientId: "", clientName: "", tickets: 0, visas: 0, hotels: 0, groups: 0, notes: "", ticketProfitType: 'percentage' as const, ticketProfitValue: 50, visaProfitType: 'percentage' as const, visaProfitValue: 100, hotelProfitType: 'percentage' as const, hotelProfitValue: 100, groupProfitType: 'percentage' as const, groupProfitValue: 100 };
        const companySettings = editingEntry?.clientId ? allCompanyOptions.find(c => c.value === editingEntry.clientId)?.settings : {};
        const initialFormValues = { ...defaultValues, ...companySettings, ...(editingEntry || {}) };
        reset(initialFormValues);
    }, [editingEntry, reset, allCompanyOptions]);


    useImperativeHandle(ref, () => ({ resetForm: () => reset({ id: uuidv4(), clientId: "", clientName: "", tickets: 0, visas: 0, hotels: 0, groups: 0, notes: "" }) }), [reset]);

    const watchAll = watch();
    const currentClientId = watch('clientId');
    
    useEffect(() => {
        const company = allCompanyOptions.find(opt => opt.value === currentClientId);
        if (company) {
            setValue('clientName', company.label);
            if(company.settings) {
                Object.entries(company.settings).forEach(([key, value]) => {
                    setValue(key as keyof SegmentSettings, value);
                });
            }
        }
    }, [currentClientId, allCompanyOptions, setValue]);
    
    const total = useMemo(() => computeCompanyTotal(watchAll, allCompanyOptions.find(c => c.value === watchAll.clientId)?.settings), [watchAll, allCompanyOptions]);

    const handleAddClick = (data: CompanyEntryFormValues) => {
        const { hasPartner, alrawdatainSharePercentage, partners } = getPeriodValues();
        const totalProfitForCompany = computeCompanyTotal(data, allCompanyOptions.find(c => c.value === data.clientId)?.settings);
        
        const partnerShareAmount = hasPartner 
            ? totalProfitForCompany * (100 - (alrawdatainSharePercentage || 0)) / 100
            : 0;

        const alrawdatainShare = totalProfitForCompany - partnerShareAmount;
        
        onAdd({ 
            ...data, 
            total: totalProfitForCompany,
            alrawdatainShare: alrawdatainShare,
            partnerShare: partnerShareAmount,
            partnerShares: (partners || []).map(p => ({
                partnerId: p.partnerId,
                partnerName: p.partnerName,
                share: partnerShareAmount * (p.percentage / 100)
            }))
        });
        reset({ id: uuidv4(), clientId: "", clientName: "", tickets: 0, visas: 0, hotels: 0, groups: 0, notes: "" });
        onCancelEdit();
    };

    return (
        <FormProvider {...form}>
            <div className="space-y-3">
                 <Card className="border rounded-lg shadow-sm border-primary/40">
                    <CardHeader className="p-2 flex flex-row items-center justify-between bg-muted/30">
                        <CardTitle className="text-base font-semibold">{editingEntry ? 'تعديل بيانات الشركة' : 'إدخال بيانات الشركة'}</CardTitle>
                        <div className='font-mono text-sm text-blue-600 font-bold'>ربح الشركة: {total.toFixed(2)}</div>
                    </CardHeader>
                    <CardContent className="space-y-3 p-3">
                        <Controller control={control} name="clientId" render={({ field, fieldState }) => (<div className="space-y-1"><Label>الشركة المصدرة للسكمنت</Label><Autocomplete options={allCompanyOptions} value={field.value} onValueChange={field.onChange} placeholder="ابحث/اختر..."/><p className="text-xs text-destructive h-3">{fieldState.error?.message}</p></div>)} />
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <ServiceLine label="تذاكر" icon={Ticket} color="primary" countField="tickets" typeField="ticketProfitType" valueField="ticketProfitValue" />
                            <ServiceLine label="فيزا" icon={CreditCard} color="accent" countField="visas" typeField="visaProfitType" valueField="visaProfitValue" />
                            <ServiceLine label="فنادق" icon={Hotel} color="primary" countField="hotels" typeField="hotelProfitType" valueField="hotelProfitValue" />
                            <ServiceLine label="كروبات" icon={GroupsIcon} color="accent" countField="groups" typeField="groupProfitType" valueField="groupProfitValue" />
                        </div>
                        <div className="flex justify-center pt-2">
                          <Button type="button" onClick={handleSubmit(handleAddClick)} className='w-full md:w-1/2'>
                              {editingEntry ? <Pencil className="me-2 h-4 w-4" /> : <ArrowDown className="me-2 h-4 w-4" />}
                              {editingEntry ? 'تحديث الشركة' : 'إضافة إلى الفترة'}
                          </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </FormProvider>
    );
});
AddCompanyToSegmentForm.displayName = "AddCompanyToSegmentForm";

const SummaryList = ({
  onRemove,
  onEdit,
}: {
  onRemove: (index: number) => void;
  onEdit: (index: number) => void;
}) => {
  const { watch } = useFormContext<PeriodFormValues>();
  const summaryEntries = watch("summaryEntries");
  const { user: currentUser } = useAuth();


  if (!summaryEntries || summaryEntries.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
        لم يتم إضافة أي شركات إلى الفترة حتى الآن.
      </div>
    );
  }

  return (
    <Card className="border border-muted shadow-sm">
      <CardHeader className="p-3 flex items-center justify-between bg-muted/20 rounded-t-md">
        <CardTitle className="text-base font-semibold">
          الشركات المضافة ({summaryEntries.length})
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
            <Table>
            <TableHeader className="bg-muted/40">
                <TableRow>
                <TableHead className="w-[90px] text-center">رقم الفاتورة</TableHead>
                <TableHead>الشركة المصدرة للسكمنت</TableHead>
                <TableHead>الشركاء</TableHead>
                <TableHead className="text-center">إجمالي المبلغ</TableHead>
                <TableHead className="text-center">حصة الروضتين</TableHead>
                <TableHead className="text-center">حصة الشركاء</TableHead>
                <TableHead className="text-center">موظف الإدخال</TableHead>
                <TableHead className="text-center w-[110px]">الإجراءات</TableHead>
                </TableRow>
            </TableHeader>

            <TableBody>
                {summaryEntries.map((entry: any, index: number) => (
                <TableRow key={entry.id}>
                    <TableCell className="text-center font-mono">
                         <Button variant="link" className="p-0 h-auto" type="button">
                            {entry.invoiceNumber || "(تلقائي)"}
                        </Button>
                    </TableCell>
                    <TableCell className="font-semibold text-sm">
                    {entry.clientName || "غير محدد"}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                    {entry.partnerShares && entry.partnerShares.length > 0
                        ? entry.partnerShares
                            .map(
                            (p: any) =>
                                `${p.partnerName} (${Number(p.share).toFixed(2)})`
                            )
                            .join("، ")
                        : "لا يوجد شركاء"}
                    </TableCell>

                    <TableCell className="text-center font-mono">
                    {Number(entry.total || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center font-mono text-green-600">
                    {Number(entry.alrawdatainShare || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center font-mono text-blue-600">
                    {Number(entry.partnerShare || 0).toFixed(2)}
                    </TableCell>

                    <TableCell className="text-center text-sm">
                    {currentUser?.name || 'غير محدد'}
                    </TableCell>

                    <TableCell className="text-center space-x-1 rtl:space-x-reverse">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-blue-600"
                        title="تعديل"
                        onClick={() => onEdit(index)}
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        title="حذف"
                        onClick={() => onRemove(index)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                    </TableCell>
                </TableRow>
                ))}
            </TableBody>
            </Table>
        </div>
      </CardContent>
    </Card>
  );
};

const SummaryStat = ({ title, value, currency, className }: { title: string; value: number; currency: string; className?: string; }) => (
    <div className={cn("text-center p-2 rounded-lg bg-background border", className)}>
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
        <p className="font-bold font-mono text-sm">
            {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
        </p>
    </div>
);


// Main Dialog Wrapper
interface AddSegmentPeriodDialogProps { clients: Client[]; suppliers: Supplier[]; onSuccess: () => Promise<void>; isEditing?: boolean; existingPeriod?: any; children?: React.ReactNode; }

export default function AddSegmentPeriodDialog({ clients, suppliers, onSuccess, isEditing = false, existingPeriod, children }: AddSegmentPeriodDialogProps) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const addCompanyFormRef = React.useRef<{ resetForm: () => void }>(null);
    const [editingEntry, setEditingEntry] = useState<any | null>(null);
    const { data: navData, fetchData } = useVoucherNav();
    const { user: currentUser } = useAuth();
    
    const [currentPartnerId, setCurrentPartnerId] = useState('');
    const [currentPercentage, setCurrentPercentage] = useState<number | string>('');
    const [editingPartnerIndex, setEditingPartnerIndex] = useState<number | null>(null);

    const periodForm = useForm<PeriodFormValues>({ resolver: zodResolver(periodSchema) });
    const { control, handleSubmit: handlePeriodSubmit, watch, setValue, formState: { errors: periodErrors }, trigger, reset: resetForm, getValues } = periodForm;
    const { fields: summaryFields, append, remove, update } = useFieldArray({ control: periodForm.control, name: "summaryEntries" });
    const { fields: partnerFields, append: appendPartner, remove: removePartner, update: updatePartner } = useFieldArray({ control: periodForm.control, name: "partners" });
    
    const watchedPeriod = watch();
    
    const allCompanyOptions = useMemo(() => {
        return clients.filter(c => c.type === 'company').map(c => ({ value: c.id, label: c.name, settings: c.segmentSettings }));
    }, [clients]);

     const partnerOptions = useMemo(() => {
        const allRelations = [...clients, ...suppliers];
        const uniqueRelations = Array.from(new Map(allRelations.map(item => [item.id, item])).values());
        return uniqueRelations.map(r => {
            let labelPrefix = '';
            if (r.relationType === 'client') labelPrefix = 'عميل: ';
            else if (r.relationType === 'supplier') labelPrefix = 'مورد: ';
            else if (r.relationType === 'both') labelPrefix = 'عميل ومورد: ';
            return { value: r.id, label: `${labelPrefix}${r.name}` };
        });
    }, [clients, suppliers]);
    
    const currencyOptions = useMemo(() => navData?.settings?.currencySettings?.currencies || [], [navData]);
    const boxName = useMemo(() => (currentUser && 'boxId' in currentUser && currentUser.boxId) ? navData?.boxes?.find(b => b.id === currentUser.boxId)?.name || 'غير محدد' : 'غير محدد', [currentUser, navData?.boxes]);

    const { activeStep, goToNextStep, goToPreviousStep, resetSteps, isDisabledStep, isLastStep } = useStepper({
        initialStep: 0,
        steps: [{label: 'الفترة'}, {label: 'الشركات'}, {label: 'التوزيع'}, {label: 'حفظ'}]
    });


    useEffect(() => {
        if (open) {
             const defaultValues = {
                fromDate: null, toDate: null, entryDate: new Date(), currency: navData?.settings?.currencySettings?.defaultCurrency || 'USD', hasPartner: false,
                alrawdatainSharePercentage: navData?.settings?.segmentSettings?.alrawdatainSharePercentage || 100, partners: [], summaryEntries: []
            };

            if (isEditing && existingPeriod) {
                resetForm({
                    ...defaultValues,
                    fromDate: parseISO(existingPeriod.fromDate),
                    toDate: parseISO(existingPeriod.toDate),
                    summaryEntries: existingPeriod.entries,
                    // TODO: Need to load partner data if exists
                });
            } else {
                 resetForm(defaultValues);
            }
           
            setEditingEntry(null);
            resetSteps();
        }
    }, [open, isEditing, existingPeriod, resetForm, navData, resetSteps]);
    
    const grandTotalProfit = useMemo(() => (summaryFields || []).reduce((sum, e) => sum + (e.total || 0), 0), [summaryFields]);
    
    const { 
        totalPartnerPercentage, 
        alrawdatainSharePercentage,
        alrawdatainShareAmount, 
        amountForPartners, 
        distributedToPartners, 
        remainderForPartners 
    } = useMemo(() => {
        const hasPartner = watchedPeriod.hasPartner;
        const alrawdatainPerc = hasPartner ? (Number(watchedPeriod.alrawdatainSharePercentage) || 0) : 100;
        const partnerPercTotal = (watchedPeriod.partners || []).reduce((acc, p) => acc + (Number(p.percentage) || 0), 0);
        
        const alrawdatainAmount = grandTotalProfit * (alrawdatainPerc / 100);
        const availableForPartnersAmount = grandTotalProfit - alrawdatainAmount;
        
        const distributedAmount = (watchedPeriod.partners || []).reduce((acc, p) => {
            const share = availableForPartnersAmount * ((p.percentage || 0) / 100);
            return acc + share;
        }, 0);

        return { 
            totalPartnerPercentage: partnerPercTotal, 
            alrawdatainSharePercentage: alrawdatainPerc,
            alrawdatainShareAmount: alrawdatainAmount,
            amountForPartners: availableForPartnersAmount,
            distributedToPartners: distributedAmount,
            remainderForPartners: availableForPartnersAmount - distributedAmount,
        };
    }, [grandTotalProfit, watchedPeriod.hasPartner, watchedPeriod.alrawdatainSharePercentage, watchedPeriod.partners]);
    
    const partnerSharePreview = useMemo(() => {
        const value = Number(currentPercentage) || 0;
        return amountForPartners * (value / 100);
    }, [currentPercentage, amountForPartners]);

    const handleAddOrUpdateEntry = (entryData: any) => {
        if (editingEntry) {
            const index = summaryFields.findIndex(f => f.id === editingEntry.id);
            if (index > -1) update(index, { ...summaryFields[index], ...entryData, id: summaryFields[index].id });
            setEditingEntry(null);
        } else {
            append({ ...entryData, id: uuidv4(), createdBy: currentUser?.name, invoiceNumber: `BK-${Date.now()}` });
        }
        addCompanyFormRef.current?.resetForm();
    };
    
    const handleEditEntry = (index: number) => setEditingEntry(summaryFields[index]);
    
    const removeEntry = (index: number) => remove(index);

    const handleSavePeriod = async (data: PeriodFormValues) => {
        if (summaryFields.length === 0) {
            toast({ title: "لا توجد سجلات للحفظ", variant: "destructive" });
            return;
        }
        if (data.hasPartner && Math.abs(totalPartnerPercentage - 100) > 0.01) {
            toast({ title: "خطأ في توزيع حصص الشركاء", description: `مجموع نسب الشركاء يجب أن يكون 100% تمامًا من المبلغ المتاح لهم. المجموع الحالي: ${totalPartnerPercentage.toFixed(2)}%`, variant: "destructive" });
            return;
        }

        setIsSaving(true);
        try {
            const finalEntries = summaryFields.map((entry: any) => ({
                ...entry,
                entryDate: format(data.entryDate, 'yyyy-MM-dd'),
                fromDate: format(data.fromDate!, 'yyyy-MM-dd'),
                toDate: format(data.toDate!, 'yyyy-MM-dd'),
                currency: data.currency,
                hasPartner: data.hasPartner,
                alrawdatainSharePercentage: data.alrawdatainSharePercentage,
                partnerShares: (data.partners || []).map(p => ({
                    partnerId: p.partnerId,
                    partnerName: p.partnerName,
                    share: (entry.partnerShare * (p.percentage / 100))
                }))
            }));
            const result = await addSegmentEntries(finalEntries as any, isEditing ? existingPeriod?.periodId : undefined);
            if (!result.success) throw new Error(result.error);
            toast({ title: "تم حفظ بيانات الفترة بنجاح" });
            setOpen(false);
            await onSuccess();
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message || "لم يتم حفظ البيانات.", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleAddOrUpdatePartner = () => {
        if(!currentPartnerId || !currentPercentage) {
            toast({ title: "الرجاء تحديد الشريك والنسبة", variant: 'destructive' });
            return;
        }
        const newPercentage = Number(currentPercentage);
        if (isNaN(newPercentage) || newPercentage <= 0) {
            toast({ title: "النسبة يجب أن تكون رقمًا موجبًا", variant: 'destructive' });
            return;
        }
        
        const currentPartners = getValues('partners') || [];
        
        const editingPartnerOldPercentage = editingPartnerIndex !== null ? currentPartners[editingPartnerIndex]?.percentage || 0 : 0;
        const currentTotalPartnerPercentage = currentPartners.reduce((sum, p) => sum + p.percentage, 0) - editingPartnerOldPercentage;
        const adjustedTotal = currentTotalPartnerPercentage + newPercentage;

        if (adjustedTotal > 100.01) { // Use tolerance
             toast({ title: "لا يمكن تجاوز 100%", description: `إجمالي النسب الحالية: ${currentTotalPartnerPercentage.toFixed(2)}%`, variant: 'destructive' });
             return;
        }

        const selectedPartner = partnerOptions.find(p => p.value === currentPartnerId);
        if(!selectedPartner) {
             toast({ title: "الشريك المختار غير صالح", variant: 'destructive' });
             return;
        }

        const partnerData = {
            id: editingPartnerIndex !== null ? partnerFields[editingPartnerIndex].id : `new-${Date.now()}`,
            partnerId: selectedPartner.value,
            partnerName: selectedPartner.label,
            percentage: newPercentage,
            amount: (amountForPartners * newPercentage) / 100
        };

        if (editingPartnerIndex !== null) {
          updatePartner(editingPartnerIndex, partnerData);
          setEditingPartnerIndex(null);
        } else {
          appendPartner(partnerData);
        }
        
        setCurrentPartnerId('');
        setCurrentPercentage('');
    };
    
    const handleEditPartner = (index: number) => {
        const partnerToEdit = partnerFields[index];
        setEditingPartnerIndex(index);
        setCurrentPartnerId(partnerOptions.find(p => p.value.endsWith(partnerToEdit.partnerId))?.value || '');
        setCurrentPercentage(partnerToEdit.percentage);
    };

    const isDistributionLocked = watchedPeriod.hasPartner && Math.abs(totalPartnerPercentage - 100) > 0.01;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children || <Button><PlusCircle className="me-2 h-4 w-4" />إضافة سجل جديد</Button>}</DialogTrigger>
            <DialogContent className="sm:max-w-7xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'تعديل سجل سكمنت' : 'إضافة سجل سكمنت جديد'}</DialogTitle>
                </DialogHeader>
                <FormProvider {...periodForm}>
                    <form onSubmit={handlePeriodSubmit(handleSavePeriod)} className="flex flex-col flex-grow overflow-hidden">
                        <div className="flex-grow overflow-y-auto -mx-6 px-6 space-y-6 pb-4">
                            <Collapsible defaultOpen={true} className="p-4 border rounded-lg space-y-6 bg-background/50">
                               <CollapsibleTrigger asChild>
                                  <h3 className="font-semibold text-base cursor-pointer">الفترة وتوزيع الحصص</h3>
                               </CollapsibleTrigger>
                               <CollapsibleContent className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <FormField control={periodForm.control} name="fromDate" render={({ field }) => ( <FormItem><FormLabel>من تاريخ</FormLabel><DateTimePicker date={field.value} setDate={field.onChange} /></FormItem> )}/>
                                        <FormField control={periodForm.control} name="toDate" render={({ field }) => ( <FormItem><FormLabel>إلى تاريخ</FormLabel><DateTimePicker date={field.value} setDate={field.onChange} /></FormItem> )}/>
                                        <FormField control={periodForm.control} name="entryDate" render={({ field }) => ( <FormItem><FormLabel>تاريخ الإضافة</FormLabel><DateTimePicker date={field.value} setDate={field.onChange} /></FormItem> )}/>
                                        <FormField control={periodForm.control} name="currency" render={({ field }) => ( 
                                            <FormItem>
                                                <FormLabel>العملة</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                    <SelectContent>
                                                        {currencyOptions.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </FormItem>
                                        )}/>
                                    </div>
                                    <div className="pt-4 border-t mt-4">
                                        <div className="space-y-5">
                                            <div className="flex items-center justify-between border-b pb-2">
                                                <FormField
                                                control={periodForm.control}
                                                name="hasPartner"
                                                render={({ field }) => (
                                                    <FormItem className="flex items-center gap-3">
                                                    <FormLabel className="font-semibold text-base">
                                                        هل يوجد شركاء في الربح؟
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                                    </FormControl>
                                                    </FormItem>
                                                )}
                                                />
                                            </div>

                                            {watchedPeriod.hasPartner && (
                                                <>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                    <SummaryStat title="حصة الروضتين" value={alrawdatainSharePercentage} currency="%" className="bg-green-50 text-green-700 border-green-200" />
                                                    <SummaryStat title="المتاح للشركاء" value={100 - alrawdatainSharePercentage} currency="%" className="bg-blue-50 text-blue-700 border-blue-200" />
                                                    <SummaryStat title="الموزع للشركاء" value={totalPartnerPercentage} currency="%" className="bg-amber-50 text-amber-700 border-amber-200" />
                                                    <SummaryStat title="المتبقي للتوزيع" value={100 - totalPartnerPercentage} currency="%" className={cn("border", Math.abs(100 - totalPartnerPercentage) > 0.01 ? "bg-red-50 text-red-700 border-red-300" : "bg-gray-50 text-gray-600 border-gray-200")} />
                                                </div>

                                                <div className="p-3 border rounded-lg bg-muted/10 space-y-3">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 items-end">
                                                    <div className="space-y-1.5"><Label>نسبة الروضتين (%)</Label><Controller control={periodForm.control} name="alrawdatainSharePercentage" render={({field}) => (<NumericInput {...field} onValueChange={(v) => field.onChange(v || 0)} className="h-9 text-center" /> )}/></div>
                                                    <div className="space-y-1.5"><Label>الشريك</Label><Autocomplete options={partnerOptions} value={currentPartnerId} onValueChange={setCurrentPartnerId} placeholder="اختر الشريك..."/></div>
                                                    <div className="space-y-1.5"><Label>النسبة (%)</Label><div className="relative"><NumericInput value={currentPercentage} onValueChange={setCurrentPercentage} className="h-9 pe-7 text-center" /><Percent className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /></div></div>
                                                    <Button type="button" onClick={handleAddOrUpdatePartner} className="h-9 w-full md:w-auto">{editingPartnerIndex !== null ? "تحديث" : "إضافة"}</Button>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground text-end">الحصة المحسوبة: <span className="font-bold text-blue-600 font-mono ms-1">{partnerSharePreview.toFixed(2)}</span></p>
                                                </div>

                                                <div className="border rounded-lg overflow-hidden">
                                                    <Table><TableHeader className="bg-muted/30"><TableRow><TableHead>الشريك</TableHead><TableHead className="text-center">النسبة</TableHead><TableHead className="w-24 text-center">الإجراءات</TableHead></TableRow></TableHeader>
                                                    <TableBody>
                                                    {partnerFields.length === 0 ? (<TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">لا يوجد شركاء مضافون بعد</TableCell></TableRow>) :
                                                    (partnerFields.map((d, index) => (
                                                        <TableRow key={d.id}>
                                                            <TableCell>{d.partnerName}</TableCell>
                                                            <TableCell className="text-center font-mono">{Number(d.percentage).toFixed(2)}%</TableCell>
                                                            <TableCell className="text-center">
                                                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => handleEditPartner(index)}><Pencil className="h-4 w-4"/></Button>
                                                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removePartner(index)}><Trash2 className="h-4 w-4" /></Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    )))}
                                                    </TableBody>
                                                    </Table>
                                                </div>
                                                </>
                                            )}
                                            </div>
                                    </div>
                               </CollapsibleContent>
                            </Collapsible>
                            <div className={cn(isDistributionLocked && "opacity-50 pointer-events-none")}>
                                <AddCompanyToSegmentForm ref={addCompanyFormRef} onAdd={handleAddOrUpdateEntry} editingEntry={editingEntry} onCancelEdit={() => setEditingEntry(null)} allCompanyOptions={allCompanyOptions} partnerOptions={partnerOptions} />
                            </div>
                            <div className={cn(isDistributionLocked && "opacity-50 pointer-events-none")}>
                                <SummaryList onRemove={removeEntry} onEdit={handleEditEntry} />
                            </div>
                        </div>
                        <DialogFooter className="pt-4 border-t flex-row items-center justify-between sticky bottom-0 bg-background mt-auto">
                             <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                                <SummaryStat title="إجمالي الربح" value={grandTotalProfit} currency={watchedPeriod.currency} />
                                <SummaryStat title="حصة الروضتين" value={alrawdatainShareAmount} currency={watchedPeriod.currency} className="text-green-600" />
                                <SummaryStat title="حصة الشركاء" value={amountForPartners} currency={watchedPeriod.currency} className="text-blue-600" />
                                <SummaryStat title="المتبقي" value={remainderForPartners} currency={watchedPeriod.currency} className={cn(Math.abs(remainderForPartners) > 0.01 && 'text-destructive')} />
                            </div>
                            <div className="flex items-center gap-2">
                                <Button type="submit" disabled={isSaving || summaryFields.length === 0}>
                                    {isSaving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                                    <Save className="me-2 h-4 w-4" />
                                    حفظ بيانات الفترة ({summaryFields.length} سجلات)
                                </Button>
                            </div>
                        </DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    );
}

