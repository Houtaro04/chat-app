import React from "react";
import {Row, Col} from 'antd';
<<<<<<< HEAD
import ChatWindow from "./ChatWindow.jsx";
import SideBar from "./SideBar.jsx";
=======
import ChatWindow from "./ChatWindow";
import Sidebar from "./Sidebar";
>>>>>>> a8db88875c664bdd6cc575df4f6c3ecd014aa843

export default function ChatRoom() {
  return (
        <Row>
          <Col span={6}>
<<<<<<< HEAD
            <SideBar />
=======
            <Sidebar />
>>>>>>> a8db88875c664bdd6cc575df4f6c3ecd014aa843
          </Col>
          <Col span={18}>
            <ChatWindow />
          </Col>
        </Row>
  );
}