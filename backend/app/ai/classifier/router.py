from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.shared.models.employee import Department, Employee


class RoutingClassifier:
    """Predicts appropriate department and recipient based on document context."""

    async def predict_routing(
        self,
        text: str,
        session: AsyncSession,
    ) -> Dict[str, Any]:
        text_lower = text.lower()

        # Query departments
        dept_stmt = select(Department)
        dept_res = await session.execute(dept_stmt)
        departments: List[Department] = list(dept_res.scalars().all())

        best_dept: Optional[Department] = None
        dept_confidence = 0.50

        for dept in departments:
            if dept.name.lower() in text_lower or dept.code.lower() in text_lower:
                best_dept = dept
                dept_confidence = 0.92
                break

        # If "hành chính" or "admin" or "quy hoạch" mentioned
        if not best_dept:
            for dept in departments:
                if "hành chính" in dept.name.lower() or "hc" in dept.code.lower():
                    best_dept = dept
                    dept_confidence = 0.85
                    break

        # Query employee candidates
        emp_stmt = select(Employee)
        emp_res = await session.execute(emp_stmt)
        employees: List[Employee] = list(emp_res.scalars().all())

        best_emp: Optional[Employee] = None
        emp_confidence = 0.50

        for emp in employees:
            if emp.full_name.lower() in text_lower:
                best_emp = emp
                emp_confidence = 0.95
                break

        return {
            "department_id": best_dept.id if best_dept else None,
            "department_candidate": best_dept.name if best_dept else None,
            "department_confidence": dept_confidence,
            "recipient_id": best_emp.id if best_emp else None,
            "recipient_candidate": best_emp.full_name if best_emp else None,
            "recipient_confidence": emp_confidence,
        }
