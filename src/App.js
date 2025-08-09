import Login from './Components/Login';
import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ChatRoom from './Components/ChatRoom';
import AuthProvider from './Context/AuthProvider';
import AppProvider from './Context/AppProvider';
import AddRoomModal from './Components/Modals/AddRoomModal';
import InviteMembersModal from './Components/Modals/InviteMembersModal';


function App() {
  return (
  <BrowserRouter>
    <AuthProvider>
      <AppProvider>
        <Routes>
          <Route element={<Login />} path="/login" />
          <Route element={<ChatRoom />} path="/" />
        </Routes>
        <AddRoomModal />
        <InviteMembersModal />
      </AppProvider>
    </AuthProvider>
  </BrowserRouter>);
}

export default App;
