import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { HomePage } from '@/pages/HomePage';
import { GalleryPage } from '@/pages/GalleryPage';
import { MyBoardPage } from '@/pages/MyBoardPage';
import { OurClassPage } from '@/pages/OurClassPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { FolderPage } from '@/pages/FolderPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { AIChatPage } from '@/pages/AIChatPage';
import { TokensDemoPage } from '@/pages/TokensDemoPage';
import { EvalPage } from '@/pages/EvalPage';

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
