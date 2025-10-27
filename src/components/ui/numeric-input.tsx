
"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/types";

// A robust function to parse different decimal and thousands formats
const parseNumericValue = (value: string): number | undefined => {
    if (typeof value !== 'string' || value.trim() === '') return undefined;
    // Standardize decimal separator to a period and remove thousands separators
    const sanitized = value.replace(/,/g, ''); // Remove commas before parsing
    
    const num = parseFloat(sanitized);
    return isNaN(num) ? undefined : num;
};


interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> {
  value?: number | string | null;
  onValueChange?: (value: number | undefined) => void;
  allowNegative?: boolean;
  currency?: Currency;
  currencyClassName?: string;
  direction?: 'ltr' | 'rtl';
}

const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onValueChange, className, allowNegative = false, currency, currencyClassName, direction = 'rtl', ...props }, ref) => {
    
    const formatValue = (num: number | string | null | undefined): string => {
        if (num === null || num === undefined || num === '') return '';
        const numericVal = typeof num === 'string' ? parseNumericValue(num) : num;
        if (numericVal === undefined) return String(num); // Return original string if not parsable
        return new Intl.NumberFormat('en-US').format(numericVal);
    };
    
    const [displayValue, setDisplayValue] = React.useState<string>(formatValue(value));

    // When the external value prop changes, update the internal state
    React.useEffect(() => {
        setDisplayValue(formatValue(value));
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      const sanitized = rawValue.replace(/,/g, ''); // Remove commas for validation
      
      // Allow only numbers, one decimal point, and optionally a negative sign
      const regex = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;

      if (regex.test(sanitized) || sanitized === '') {
        const numericVal = parseNumericValue(sanitized);
        setDisplayValue(numericVal !== undefined ? formatValue(numericVal) : sanitized);

        if (onValueChange) {
            onValueChange(numericVal);
        }
      }
    };
    
    const inputProps = {
        ...props,
        ref,
        type: "text" as const,
        inputMode: "decimal" as const,
        placeholder: "0.00",
        value: displayValue || '',
        onChange: handleChange
    };
    
    if (currency) {
      return (
        <div className={cn("relative flex items-center w-full", className)}>
          <Input
            {...inputProps}
            className={cn(
              "z-10 text-right w-full",
              direction === 'rtl' ? "rounded-l-none rounded-r-lg border-l-0" : "rounded-r-none rounded-l-lg border-r-0"
            )}
          />
           <div className={cn(
            "p-2 bg-muted border h-full flex items-center",
            currencyClassName,
            direction === 'rtl' ? "rounded-l-lg" : "rounded-r-lg"
          )}>
                <span className="text-xs font-semibold">{currency}</span>
            </div>
        </div>
      );
    }
    
    return (
      <Input
        {...inputProps}
        className={cn("text-right", className)}
      />
    );
  }
);
NumericInput.displayName = "NumericInput";

export { NumericInput };
