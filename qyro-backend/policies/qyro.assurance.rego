package qyro.assurance

decisions contains decision(control) if {
	some control in input.controls
}

decision(control) := blocked if {
	violated(control)
	blocked_event
	blocked := result(control, "BLOCKED_VIOLATION", sprintf("%s on %s would violate %s and was blocked", [operation, resource, control.id]))
} else := violated_result if {
	violated(control)
	violated_result := result(control, "VIOLATED", violation_message(control))
} else := ineffective if {
	excess(control)
	ineffective := result(control, "INEFFECTIVE", sprintf("Capability still grants excess permission checked by %s", [control.id]))
} else := unknown if {
	not posture_evidence
	unknown := result(control, "UNKNOWN", "No telemetry or capability evidence for this control")
} else := not_tested if {
	not mapped(control)
	not_tested := result(control, "NOT_TESTED", "Control has no runtime rule yet")
} else := result(control, "EFFECTIVE", sprintf("%s holds", [control.id]))

result(control, state, message) := {
	"control_id": control.id,
	"state": state,
	"evidence": {"message": message, "control": control.id},
}

mapped(control) if control.id in {"C-001", "C-002", "C-003", "C-004"}

blocked_event if object.get(input.event, "blocked", false) == true

operation := object.get(input.event, "operation", "")

resource := lower(sprintf("%v", [object.get(input.event, "resource", "")]))

posture_evidence if count(object.get(input.capability, "scopes", [])) > 0

posture_evidence if operation != ""

violated(control) if {
	control.id == "C-001"
	phi_resource
}

violated(control) if {
	control.id == "C-002"
	operation in {"PUT", "POST", "DELETE"}
}

violated(control) if {
	control.id == "C-004"
	operation in {"DELETE", "DROP"}
}

violated(control) if {
	control.id == "C-003"
	operation != ""
	not approved_api
}

phi_resource if contains(resource, "patient")

phi_resource if contains(resource, "phi")

approved_api if {
	some scope in object.get(input.capability, "scopes", [])
	scope.effect == "ALLOW"
	not scope_is_excess(scope)
	token := lower(object.get(scope, "resource", scope.name))
	token != ""
	contains(resource, token)
}

scope_is_excess(scope) if scope.excess == true

excess(control) if {
	control.id in {"C-001", "C-002", "C-004"}
	some scope in object.get(input.capability, "scopes", [])
	scope.excess == true
	scope.effect == "ALLOW"
}

violation_message(control) := sprintf("Illegal %s on %s", [operation, resource]) if {
	control.id in {"C-002", "C-004"}
} else := sprintf("Accessed PHI resource: %s", [resource]) if {
	control.id == "C-001"
} else := sprintf("Resource %s is outside the approved API list", [resource])
