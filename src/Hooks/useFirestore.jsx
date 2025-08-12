import { useEffect, useState } from "react";
import { db } from "../firebase/config";

export const useFirestore = (collection, condition) => {
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    if (!collection) {
      setDocuments([]);
      return;
    }

    let ref = db.collection(collection).orderBy("createdAt", "asc");

    // Build query an toàn theo operator
    if (condition?.fieldName && condition?.operator) {
      const { fieldName, operator, compareValue } = condition;

      // guard theo từng loại operator
      if (operator === "in" || operator === "array-contains-any") {
        if (!Array.isArray(compareValue) || compareValue.length === 0 || compareValue.length > 10) {
          // không mở listener với query invalid
          setDocuments([]);
          return;
        }
      } else {
        // các operator còn lại: cần giá trị không undefined (null thì được)
        if (compareValue === undefined) {
          setDocuments([]);
          return;
        }
      }

      ref = ref.where(fieldName, operator, compareValue);
    }

    // mở listener + log lỗi để thấy message cụ thể (index, invalid-argument, v.v.)
    const unsubscribe = ref.onSnapshot(
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setDocuments(docs);
      },
      (err) => {
        console.error("Firestore listen error:", err?.code, err?.message);
        setDocuments([]); // tránh giữ state cũ
      }
    );

    return () => unsubscribe && unsubscribe();
    // stringify để tránh rerender vô hạn khi object điều kiện thay ref
  }, [collection, JSON.stringify(condition)]);

  return documents;
};

export default useFirestore;
