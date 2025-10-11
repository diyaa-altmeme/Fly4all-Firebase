"use client";

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Upload, FileText, AlertTriangle, Wand2, Download, Loader2, Save, X, PlusCircle, Route as RouteIcon, Calendar as CalendarIcon, Clock, Users, DollarSign, ChevronDown, Plane, User, ArrowRight, Repeat } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { saveFlightReport } from '@/app/reports/flight-analysis/actions';
import { Badge } from '@/components/ui/badge';
import type { ExtractedPassenger, FlightReport, Client, Supplier } from '@/lib/types';
import { useVoucherNav } from '@/context/voucher-nav-context';
import { Autocomplete } from '@/components/ui/autocomplete';

interface PnrDetail {
    pnr: string;
    bookingReference: string;
    paxCount: number;
    totalPayable: number;
    passengers: ExtractedPassenger[];
}

interface FlightDataExtractorDialogProps {
    onSaveSuccess: () => void;
    children: React.ReactNode;
}

export default function FlightDataExtractorDialog({ onSaveSuccess, children }: FlightDataExtractorDialogProps) {
  const [extractedData, setExtractedData] = useState<PnrDetail[]>([]);
  const [fileName, setFileName] = useState('');
  const [flightInfo, setFlightInfo] = useState({ date: '', time: '', route: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { data: navData, loaded: navDataLoaded } = useVoucherNav();
  const [defaultSupplier, setDefaultSupplier] = useState('');

  const supplierOptions = React.useMemo(() => (navData?.suppliers || []).map(s => ({ value: s.id, label: s.name })), [navData?.suppliers]);

  const parseExcelDate = (excelDate: number | string): Date | null => {
    if (typeof excelDate === 'number' && excelDate > 1) {
        const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
        return !isNaN(date.getTime()) ? date : null;
    }
    if (typeof excelDate === 'string') {
        const date = new Date(excelDate.replace(/(\d{4})\/(\d{2})\/(\d{2})/, '$1-$2-$3'));
        if (!isNaN(date.getTime())) return date;
    }
    return null;
  };
  
  const parseDateValue = (value: any): string => {
    if (!value) return '';
    const date = parseExcelDate(value);
    return date ? date.toISOString().split('T')[0] : String(value).split(' ')[0];
  }

  const parseTimeValue = (value: any): string => {
    if (!value) return '';
    const date = parseExcelDate(value);
    if (date) {
        if (typeof value === 'number' && value < 1 && value > 0) { 
             const totalSeconds = Math.round(value * 86400);
             const hours = Math.floor(totalSeconds / 3600);
             const minutes = Math.floor((totalSeconds % 3600) / 60);
             return `${''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }
        if (date.toTimeString() !== '00:00:00 GMT+0000 (Coordinated Universal Time)') {
             return date.toTimeString().split(' ')[0].substring(0, 5);
        }
    }
    const parts = String(value).split(' ');
    return parts.length > 1 && /^\d{1,2}:\d{2}/.test(parts[1]) ? parts[1].substring(0, 5) : '';
  }
  
  const parsePayableValue = (value: any): number => {
    if (value === undefined || value === null) return 0;
    const stringValue = String(value).replace(/[^0-9.-]+/g, "");
    const numberValue = parseFloat(stringValue);
    return isNaN(numberValue) ? 0 : numberValue;
  }

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setStatus('Reading file...');
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = new Uint8Array(ev.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            
            const headerRowIndex = 4;
            
            const routeInfo = String(XLSX.utils.sheet_to_json(sheet, { header: 1 })[1][1] || '');
            const departureInfo = String(XLSX.utils.sheet_to_json(sheet, { header: 1 })[1][2] || '');
            const flightDateInfo = parseDateValue(departureInfo);
            const flightTimeInfo = parseTimeValue(departureInfo);
            setFlightInfo({ route: routeInfo, date: flightDateInfo, time: flightTimeInfo });
            
            const jsonData = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex });

            const findColumn = (jsonData: any[], keywords: RegExp): string | undefined => {
                const headerRow = jsonData[0] || {};
                return Object.keys(headerRow).find(key => keywords.test(key.toLowerCase()));
            };

            const headerRow = jsonData[0] || {};
            
            const detectedBookingRefCol = findColumn([headerRow], /booking reference|حجز/i);
            const detectedPnrClassCol = findColumn([headerRow], /pnr \/ class/i);
            const detectedFullNameCol = findColumn([headerRow], /passenger|الاسم|اسم المسافر/i);
            const detectedFirstNameCol = findColumn([headerRow], /first name|first_name|الاسم الاول/i);
            const detectedLastNameCol = findColumn([headerRow], /last name|last_name|الكنية/i);
            const detectedPayableCol = findColumn([headerRow], /payable \(pp\)|payable/i);
            const detectedGenderCol = findColumn([headerRow], /gender|الجنس/i);
            
            if (!detectedPayableCol) {
                toast({ title: "أعمدة مطلوبة مفقودة", description: "لم يتم العثور على عمود السعر (Payable (pp)).", variant: "destructive" });
                return;
            }

            let currentBookingRef = '';
            let currentPnr = '';
            
            const allPassengers: ExtractedPassenger[] = jsonData.map((row: any) => {
                let passengerName = 'N/A';
                const firstName = detectedFirstNameCol ? (row[detectedFirstNameCol] || '') : '';
                const lastName = detectedLastNameCol ? (row[detectedLastNameCol] || '') : '';

                if (firstName && lastName) {
                    passengerName = `${''}${firstName} ${lastName}`.trim();
                } else if (detectedFullNameCol) {
                    passengerName = row[detectedFullNameCol] || 'N/A';
                }

                const bookingRef = (detectedBookingRefCol && row[detectedBookingRefCol]) ? String(row[detectedBookingRefCol]) : currentBookingRef;
                const pnrClass = (detectedPnrClassCol && row[detectedPnrClassCol]) ? String(row[detectedPnrClassCol]) : currentPnr;
                
                if (bookingRef) currentBookingRef = bookingRef;
                if (pnrClass) currentPnr = pnrClass;

                return {
                    bookingReference: currentBookingRef,
                    pnrClass: currentPnr,
                    name: passengerName,
                    payable: parsePayableValue(row[detectedPayableCol]),
                    route: routeInfo,
                    flightDate: flightDateInfo,
                    flightTime: flightTimeInfo,
                    gender: detectedGenderCol ? String(row[detectedGenderCol] || '') : '',
                    firstName,
                    lastName,
                };
            }).filter(row => row.name && row.name.trim() !== '' && row.name !== 'N/A');
            
            const seenPassengers = new Map<string, { flightDate: string; flightTime: string }>();
            
            const pnrGroups: { [key: string]: PnrDetail } = {};
            allPassengers.forEach(p => {
                const pnrKey = p.bookingReference || p.pnrClass;
                const passengerKey = `${''}${pnrKey}-${p.name.toLowerCase().trim()}`;
                
                if (!pnrKey) return;

                if (!pnrGroups[pnrKey]) {
                    pnrGroups[pnrKey] = { pnr: p.pnrClass, bookingReference: p.bookingReference, paxCount: 0, totalPayable: 0, passengers: [] };
                }
                
                const isReturnTrip = seenPassengers.has(passengerKey);

                pnrGroups[pnrKey].passengers.push({ ...p, name: isReturnTrip ? `(نفس مسافر رحلة ${seenPassengers.get(passengerKey)?.flightDate} ${seenPassengers.get(passengerKey)?.flightTime})` : p.name });

                if (!isReturnTrip) {
                    seenPassengers.set(passengerKey, { flightDate: p.flightDate, flightTime: p.flightTime });
                    pnrGroups[pnrKey].totalPayable += p.payable;
                }
                 pnrGroups[pnrKey].paxCount++;
            });

            setExtractedData(Object.values(pnrGroups));
            setStatus(`File loaded. Found ${allPassengers.length} passengers in ${Object.keys(pnrGroups).length} PNRs.`);

        } catch (err: any) { setStatus(`Error reading file: ${err.message}`); toast({ title: 'Error Reading File', description: err.message, variant: 'destructive' }); }
    };
    reader.readAsArrayBuffer(f);
}, [toast]);
  
  const { paxCount, totalRevenue, payDistribution, tripTypeCounts } = useMemo(() => {
    let totalPax = 0;
    let totalRev = 0;
    const payDist: { [key: number]: { count: number, subtotal: number } } = {};
    const passengerTripCount: { [key: string]: number } = {};

    extractedData.forEach(pnrGroup => {
        pnrGroup.passengers.forEach(pax => {
            const passengerKey = `${''}${pax.pnrClass}-${pax.name.toLowerCase().trim()}`;
            passengerTripCount[passengerKey] = (passengerTripCount[passengerKey] || 0) + 1;
            
             // Only add payable amount for the first instance of a passenger within a PNR
            if (passengerTripCount[passengerKey] === 1) {
                const payable = pax.payable || 0;
                totalRev += payable;
                 if(!payDist[payable]) {
                    payDist[payable] = { count: 0, subtotal: 0 };
                }
                payDist[payable].count++;
                payDist[payable].subtotal += payable;
            }
             totalPax++;
        })
    });
    
    let oneWay = 0;
    let roundTrip = 0;
    
    const processedPassengers = new Set<string>();
    
    Object.keys(passengerTripCount).forEach(key => {
        if (!processedPassengers.has(key)) {
           if (passengerTripCount[key] > 1) {
               roundTrip++;
           } else {
               oneWay++;
           }
           processedPassengers.add(key);
        }
    });

    return {
        paxCount: totalPax,
        totalRevenue: totalRev,
        payDistribution: Object.entries(payDist).map(([amount, data]) => ({ amount: parseFloat(amount), ...data })),
        tripTypeCounts: { oneWay, roundTrip }
    };
  }, [extractedData]);

  const handleSave = async () => {
    if (!defaultSupplier) {
        toast({ title: "مطلوب", description: "الرجاء اختيار مصدر للتقرير.", variant: "destructive" });
        return;
    }
      setIsSaving(true);
      const supplierInfo = supplierOptions.find(s => s.value === defaultSupplier);
      
      const reportToSave: Omit<FlightReport, 'id'> = {
          fileName,
          flightDate: flightInfo.date,
          flightTime: flightInfo.time,
          route: flightInfo.route,
          supplierName: supplierInfo?.label || 'Unknown',
          paxCount,
          totalRevenue,
          pnrGroups: extractedData,
          passengers: extractedData.flatMap(pnrGroup => pnrGroup.passengers),
          payDistribution,
          tripTypeCounts,
          filteredRevenue: 0, // This will be calculated on the backend/analysis
          totalDiscount: 0, // This will be calculated on the backend/analysis
      };

      const result = await saveFlightReport(reportToSave);

      if (result.success) {
          toast({ title: "تم حفظ التقرير بنجاح" });
          onSaveSuccess();
          setOpen(false);
      } else if (result.error) {
          toast({ title: "خطأ", description: result.error, variant: "destructive" });
      }
      setIsSaving(false);
  }
  
    const handleExport = () => {
        const flatData = extractedData.flatMap(pnrGroup => pnrGroup.passengers.map(pax => ({
            'Booking Reference': pax.bookingReference,
            'PNR / Class': pax.pnrClass,
            'First Name': pax.firstName,
            'Last Name': pax.lastName,
            'Full Name': pax.name,
            'Gender': pax.gender,
            'Payable': pax.payable,
        })));
        
        const summary = [
            ['الوجهة', flightInfo.route],
            ['التاريخ', flightInfo.date],
            ['الوقت', flightInfo.time],
            ['عدد المسافرين', paxCount],
            ['الإيراد الكلي', totalRevenue.toFixed(2)]
        ];

        const summaryWs = XLSX.utils.aoa_to_sheet(summary);
        const detailsWs = XLSX.utils.json_to_sheet(flatData);

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, summaryWs, "ملخص الرحلة");
        XLSX.utils.book_append_sheet(wb, detailsWs, "تفاصيل المسافرين");
        
        XLSX.writeFile(wb, `flight_report_details.xlsx`);
    };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>محلل بيانات الطيران</DialogTitle>
          <DialogDescription>ارفع ملف Excel الخاص بالرحلات لتحليل البيانات واستخراج الملخصات بشكل تلقائي.</DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto pr-6 -mr-6 space-y-4">
             <Card>
                 <CardContent className="pt-6 flex flex-col items-center gap-4">
                     <Label htmlFor="file-upload-dialog" className="w-full max-w-lg cursor-pointer">
                        <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                            <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                            <p className="mt-4 font-semibold">انقر لرفع ملف أو قم بسحبه هنا</p>
                            <p className="text-sm text-muted-foreground">الملفات المدعومة: .xlsx, .xls</p>
                        </div>
                    </Label>
                    <Input id="file-upload-dialog" type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
                    {fileName && <div className="text-sm text-slate-500 mt-2">الملف المحمل: {fileName}</div>}
                 </CardContent>
            </Card>

            {extractedData.length > 0 && (
                <div className="space-y-6">
                     <Card>
                        <CardHeader className="flex flex-row justify-between items-center">
                            <div>
                                <CardTitle>النتائج المستخرجة</CardTitle>
                                <CardDescription>تم تحليل {paxCount} مسافر.</CardDescription>
                            </div>
                             <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={handleExport}>
                                    <Download className="me-2 h-4 w-4" />
                                    تصدير النتائج
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                     <h4 className="font-bold mb-2">ملخص الرحلة</h4>
                                    <Table>
                                        <TableBody>
                                            <TableRow><TableCell className="font-bold flex items-center gap-2"><RouteIcon className="h-4 w-4 text-primary"/>الوجهة</TableCell><TableCell>{flightInfo.route}</TableCell></TableRow>
                                            <TableRow><TableCell className="font-bold flex items-center gap-2"><CalendarIcon className="h-4 w-4 text-primary"/>تاريخ الرحلة</TableCell><TableCell>{flightInfo.date}</TableCell></TableRow>
                                            <TableRow><TableCell className="font-bold flex items-center gap-2"><Clock className="h-4 w-4 text-primary"/>وقت الرحلة</TableCell><TableCell>{flightInfo.time}</TableCell></TableRow>
                                            <TableRow><TableCell className="font-bold flex items-center gap-2"><Users className="h-4 w-4 text-primary"/>عدد المسافرين</TableCell><TableCell>{paxCount}</TableCell></TableRow>
                                            <TableRow><TableCell className="font-bold flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary"/>الإيراد الكلي</TableCell><TableCell className="font-mono">{totalRevenue.toFixed(2)} USD</TableCell></TableRow>
                                        </TableBody>
                                    </Table>
                                     <h4 className="font-bold mb-2 mt-4">ملخص نوع الرحلة</h4>
                                    <Table>
                                        <TableBody>
                                            <TableRow><TableCell className="font-bold flex items-center gap-2"><ArrowRight className="h-4 w-4 text-blue-500"/>ذهاب فقط</TableCell><TableCell className="font-bold">{tripTypeCounts.oneWay}</TableCell></TableRow>
                                            <TableRow><TableCell className="font-bold flex items-center gap-2"><Repeat className="h-4 w-4 text-green-500"/>ذهاب وعودة</TableCell><TableCell className="font-bold">{tripTypeCounts.roundTrip}</TableCell></TableRow>
                                        </TableBody>
                                    </Table>
                                </div>
                                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <h4 className="font-bold mb-2">ملخص الأسعار</h4>
                                         <div className="max-h-60 overflow-y-auto border rounded-lg">
                                            <Table>
                                                <TableHeader><TableRow><TableHead>السعر</TableHead><TableHead>العدد</TableHead><TableHead className="text-right">الإجمالي</TableHead></TableRow></TableHeader>
                                                <TableBody>{payDistribution.map(p => (<TableRow key={p.amount}><TableCell>{p.amount} USD</TableCell><TableCell>{p.count}</TableCell><TableCell className="font-mono text-right">{p.subtotal.toFixed(2)} USD</TableCell></TableRow>))}</TableBody>
                                                <TableFooter><TableRow><TableCell className="font-bold">المجموع</TableCell><TableCell className="font-bold font-mono">{paxCount}</TableCell><TableCell className="font-bold font-mono text-right">{totalRevenue.toFixed(2)} USD</TableCell></TableRow></TableFooter>
                                            </Table>
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="font-bold mb-2">توزيع الحجوزات</h4>
                                         <div className="max-h-60 overflow-y-auto border rounded-lg">
                                            <Table>
                                                <TableHeader><TableRow><TableHead>المرجع</TableHead><TableHead>الركاب</TableHead><TableHead className="text-right">الإجمالي</TableHead></TableRow></TableHeader>
                                                <TableBody>{extractedData.map((p, i) => (<TableRow key={i}><TableCell className="font-mono">{p.pnr || p.bookingReference}</TableCell><TableCell>{p.paxCount}</TableCell><TableCell className="font-mono text-right">{p.totalPayable.toFixed(2)}</TableCell></TableRow>))}</TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                 </div>
                                <div className="lg:col-span-2">
                                     <h4 className="font-bold mb-2">تفاصيل المسافرين</h4>
                                     <div className="max-h-80 overflow-y-auto border rounded-lg">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Booking Reference</TableHead>
                                                    <TableHead>PNR / Class</TableHead>
                                                    <TableHead>Full Name</TableHead>
                                                    <TableHead>Gender</TableHead>
                                                    <TableHead className="text-right">Payable</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {extractedData.flatMap(pnrGroup => pnrGroup.passengers).map((pax, index) => (
                                                    <TableRow key={index}>
                                                        <TableCell>{pax.bookingReference}</TableCell>
                                                        <TableCell>{pax.pnrClass}</TableCell>
                                                        <TableCell>{pax.name}</TableCell>
                                                        <TableCell>{pax.gender}</TableCell>
                                                        <TableCell className="font-mono text-right">{pax.payable.toFixed(2)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                     </div>
                                </div>
                             </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
         <DialogFooter>
            <div className="flex items-center gap-2">
                <Label>مصدر التقرير:</Label>
                <Autocomplete
                    options={supplierOptions}
                    value={defaultSupplier}
                    onValueChange={setDefaultSupplier}
                    placeholder="اختر المورد..."
                />
            </div>
          <DialogClose asChild>
            <Button variant="ghost">إلغاء</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={isSaving || extractedData.length === 0}>
             {isSaving ? <Loader2 className="me-2 h-4 w-4 animate-spin"/> : <Save className="me-2 h-4 w-4" />} حفظ النتائج
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    