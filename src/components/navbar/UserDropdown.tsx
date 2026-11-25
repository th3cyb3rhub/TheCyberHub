"use client"

import React from 'react';
import Link from 'next/link';
import {
    ChevronDown,
    User,
    LogOut,
    LayoutDashboard,
    Shield,
    Ticket,
    GraduationCap,
    Building2,
    KeyRound,
} from 'lucide-react';

interface UserDropdownProps {
    user: { name: string; email: string; role: string };
    logout: (options?: { allDevices?: boolean }) => Promise<void>;
}

export const UserDropdown = ({
    user,
    logout,
}: UserDropdownProps) => {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <div
            className="relative"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
        >
            <button className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors" aria-label="User menu" aria-expanded={isOpen}>
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-sm font-medium text-white">
                    {user.name.charAt(0).toUpperCase()}
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 pt-2 w-48 z-50">
                    <div className="bg-white/95 dark:bg-black/95 backdrop-blur-xl rounded-xl border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200 dark:border-white/10">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.name}</p>
                            <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        </div>
                        <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/5 transition-all">
                            <LayoutDashboard className="w-4 h-4" /> Dashboard
                        </Link>
                        <Link href="/profile" className="flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/5 transition-all">
                            <User className="w-4 h-4" /> Profile
                        </Link>
                        <Link href="/profile/sessions" className="flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/5 transition-all">
                            <KeyRound className="w-4 h-4" /> Active sessions
                        </Link>
                        {(user.role === 'admin' || user.role === 'owner' || user.role === 'moderator') && (
                            <Link href="/admin" className="flex items-center gap-3 px-4 py-3 text-sm text-orange-700 hover:text-orange-800 hover:bg-gray-100 dark:text-orange-400 dark:hover:text-orange-300 dark:hover:bg-white/5 transition-all">
                                <Shield className="w-4 h-4" /> Admin Panel
                            </Link>
                        )}
                        <Link href="/my-events" className="flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/5 transition-all">
                            <Ticket className="w-4 h-4" /> My Events
                        </Link>
                        <Link href="/internships/applications" className="flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/5 transition-all">
                            <GraduationCap className="w-4 h-4" /> My Applications
                        </Link>
                        {(user.role === 'employer' || user.role === 'admin' || user.role === 'owner') && (
                            <>
                                <Link href="/employer" className="flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/5 transition-all">
                                    <Building2 className="w-4 h-4" /> Employer Dashboard
                                </Link>
                                <Link href="/employer/company" className="flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/5 transition-all">
                                    <Building2 className="w-4 h-4" /> Company Profile
                                </Link>
                            </>
                        )}
                        <button onClick={() => { void logout(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-700 hover:text-red-800 hover:bg-gray-100 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-white/5 transition-all">
                            <LogOut className="w-4 h-4" /> Sign Out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
