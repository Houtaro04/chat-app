import { useContext } from 'react';
import { Modal, Form, Input } from 'antd';
import { AppContext } from '../../Context/AppProvider';
import { addDocument } from '../../firebase/services';
import { AuthContext } from '../../Context/AuthProvider';

export default function AddRoomModal() {
    const { isAddRoomVisible, setIsAddRoomVisible } = useContext(AppContext);
    const [form] = Form.useForm();
    const { user } = useContext(AuthContext);
    const uid = user?.uid;

    const handleCancel = () => {
        // reset form value
        form.resetFields();
        setIsAddRoomVisible(false);
    }

    const handleOk = () => {
        // Logic to handle room creation goes here
        // add new room to the database
        console.log({ foramData: form.getFieldsValue() });
        addDocument('rooms', {
            ...form.getFieldsValue(),
            members: [uid]
        });

        // reset form value
        form.resetFields();
        setIsAddRoomVisible(false);
    }
    // Modal implementation
    return (
        <div>
            <Modal
                title="Tạo phòng"
                open={isAddRoomVisible}
                onOk={handleOk}
                onCancel={handleCancel}
            >
                <Form form={form} layout="vertical">
                    <Form.Item label="Tên phòng" name="name">
                        <Input placeholder="Nhập tên phòng" />
                    </Form.Item>
                    <Form.Item label="Mô tả" name="description">
                        <Input.TextArea placeholder="Nhập mô tả" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}