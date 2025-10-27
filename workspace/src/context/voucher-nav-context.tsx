
"use client";

import type { Client, Supplier, Box, User, AppSettings, Exchange } from '@/lib/types';
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { getClients } from '@/app/relations/actions';
import { getBoxes } from '@/app/boxes/actions';
import { getUsers } from '@/app/users/actions';
import { getSettings } from '@/app/settings/actions';
import { useAuth } from '@/lib/auth-context';
import { getExchanges } from '@/app/exchanges/actions';

type VoucherNavDataContext = {
    clients: Client[];
    suppliers: Supplier[];
    boxes: Box[];
    users: User[];
    exchanges: Exchange[];
    settings: AppSettings;
};

type VoucherNavContextType = {
    data: VoucherNavDataContext | null;
    loaded: boolean;
    fetchData: (force?: boolean) => Promise<void>;
};

const VoucherNavContext = createContext<VoucherNavContextType>({
    data: null,
    loaded: false,
    fetchData: async () => {},
});

export const VoucherNavProvider = ({ children }: { children: ReactNode }) => {
    const [data, setData] = useState<VoucherNavDataContext | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const { user, loading: authLoading } = useAuth(); // Depend on auth context

    const fetchData = useCallback(async (force = false) => {
        if (isFetching || (loaded && !force)) return;

        setIsFetching(true);
        try {
            const [allRelationsRes, boxes, users, settings, exchangesRes] = await Promise.all([
                getClients({ all: true, includeInactive: false, relationType: 'all' }),
                getBoxes(),
                getUsers({ all: true }),
                getSettings(),
                getExchanges(),
            ]);

            const allRelations = allRelationsRes.clients;

            const clients = allRelations.filter(r => r.relationType === 'client' || r.relationType === 'both');
            const suppliers = allRelations.filter(r => r.relationType === 'supplier' || r.relationType === 'both');
            const exchanges = exchangesRes.accounts || [];

            setData({
                clients,
                suppliers,
                boxes,
                users: users as User[],
                exchanges,
                settings,
            });
            setLoaded(true);
        } catch (error) {
            console.error("Failed to load initial voucher navigation data:", error);
            // Optionally set an error state here
        } finally {
            setIsFetching(false);
        }
    }, [isFetching, loaded]);
    
    // Fetch data only when user is available and not a client
    useEffect(() => {
        // Only fetch if there's a user and they are not just a client portal user.
        if (!authLoading && user && !('isClient' in user && user.isClient)) {
            fetchData();
        }
    }, [user, authLoading, fetchData]);


    return (
        <VoucherNavContext.Provider value={{ data, loaded, fetchData }}>
            {children}
        </VoucherNavContext.Provider>
    );
};

export const useVoucherNav = () => {
    const context = useContext(VoucherNavContext);
    if (context === undefined) {
        throw new Error('useVoucherNav must be used within a VoucherNavProvider');
    }
    return context;
};


    