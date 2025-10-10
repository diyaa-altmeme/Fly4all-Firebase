
"use client";

import React, { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { signInWithCustomToken, getIdToken } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { loginUser } from '@/lib/auth/actions';
import Preloader from '@/components/layout/preloader';

export default function DevLoginPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');

    useEffect(() => {
        const signInWithToken = async () => {
            if (!token) {
                router.replace('/auth/login?error=No+token+provided');
                return;
            }
            try {
                const userCredential = await signInWithCustomToken(auth, token);
                const idToken = await getIdToken(userCredential.user);
                await loginUser(idToken);
                router.replace('/dashboard');
            } catch (error) {
                console.error("Dev login failed:", error);
                router.replace('/auth/login?error=Invalid+token');
            }
        };

        signInWithToken();
    }, [token, router]);

    return <Preloader />;
}
