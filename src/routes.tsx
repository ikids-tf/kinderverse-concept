import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';

/* Route-level code splitting: each page is its own lazy chunk so the initial
   load only pulls the shell + the landing page. Pages use named exports, so we
   map them to the default export React.lazy expects. The <Suspense> boundary
   lives in AppShell around <Outlet>. */
const lazyPage = (load: () => Promise<Record<string, unknown>>, name: string) =>
  lazy(() => load().then((m) => ({ default: m[name] as React.ComponentType })));

const HomePage = lazyPage(() => import('@/pages/HomePage'), 'HomePage');
const GalleryPage = lazyPage(() => import('@/pages/GalleryPage'), 'GalleryPage');
const MyBoardPage = lazyPage(() => import('@/pages/MyBoardPage'), 'MyBoardPage');
const OurClassPage = lazyPage(() => import('@/pages/OurClassPage'), 'OurClassPage');
const CalendarPage = lazyPage(() => import('@/pages/CalendarPage'), 'CalendarPage');
const FolderPage = lazyPage(() => import('@/pages/FolderPage'), 'FolderPage');
const ProfilePage = lazyPage(() => import('@/pages/ProfilePage'), 'ProfilePage');
const AIChatPage = lazyPage(() => import('@/pages/AIChatPage'), 'AIChatPage');
const TokensDemoPage = lazyPage(() => import('@/pages/TokensDemoPage'), 'TokensDemoPage');
const EvalPage = lazyPage(() => import('@/pages/EvalPage'), 'EvalPage');

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'gallery', element: <GalleryPage /> },
      { path: 'board', element: <MyBoardPage /> },
      { path: 'class', element: <OurClassPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'folder', element: <FolderPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'chat', element: <AIChatPage /> },
      { path: 'tokens', element: <TokensDemoPage /> },
      { path: 'eval', element: <EvalPage /> },
    ],
  },
]);
