package qyro.assurance_test

import data.qyro.assurance

controls := [
	{"id": "C-001"},
	{"id": "C-002"},
	{"id": "C-003"},
	{"id": "C-004"},
	{"id": "C-999"},
]

base_capability := {"scopes": [
	{"name": "schedule.read", "effect": "ALLOW"},
	{"name": "patient.update", "effect": "ALLOW", "excess": true},
]}

state(id, event, capability) := found.state if {
	result := assurance.decisions with input as {
		"controls": controls,
		"event": event,
		"capability": capability,
	}
	some found in result
	found.control_id == id
}

test_phi_write_is_violated if {
	state("C-001", {"operation": "PUT", "resource": "/patient/123"}, base_capability) == "VIOLATED"
	state("C-002", {"operation": "PUT", "resource": "/patient/123"}, base_capability) == "VIOLATED"
}

test_blocked_write_is_blocked_violation if {
	state("C-002", {"operation": "PUT", "resource": "/patient/123", "blocked": true}, base_capability) == "BLOCKED_VIOLATION"
}

test_read_outside_phi_holds_phi_control if {
	state("C-001", {"operation": "GET", "resource": "/schedule/today"}, {"scopes": [{"name": "schedule.read", "effect": "ALLOW"}]}) == "EFFECTIVE"
}

test_excess_permission_is_ineffective_when_call_is_clean if {
	state("C-002", {"operation": "GET", "resource": "/schedule/today"}, base_capability) == "INEFFECTIVE"
}

test_approved_api_holds if {
	state("C-003", {"operation": "GET", "resource": "/patient/123"}, {"scopes": [{"name": "patient.read", "effect": "ALLOW", "resource": "patient"}]}) == "EFFECTIVE"
}

test_unapproved_api_is_violated if {
	state("C-003", {"operation": "GET", "resource": "/billing/export"}, {"scopes": [{"name": "schedule.read", "effect": "ALLOW"}]}) == "VIOLATED"
}

test_delete_violates_destructive_control if {
	state("C-004", {"operation": "DELETE", "resource": "/schedule/today"}, {"scopes": []}) == "VIOLATED"
}

test_unmapped_control_without_evidence_is_unknown if {
	state("C-999", {}, {"scopes": []}) == "UNKNOWN"
}

test_unmapped_control_with_event_is_not_tested if {
	state("C-999", {"operation": "GET", "resource": "/schedule/today"}, {"scopes": []}) == "NOT_TESTED"
}
