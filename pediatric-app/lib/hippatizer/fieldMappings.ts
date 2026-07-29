/**
 * Hippatizer Field Mappings
 * Maps Hippatizer form field IDs to patient model fields
 * Used by webhook receiver to extract and transform form data
 */

export type PatientFieldName =
  | "firstName"
  | "lastName"
  | "dateOfBirth"
  | "middleInitial"
  | "gender"
  | "preferredPronouns"
  | "preferredLanguage"
  | "email"
  | "phone"
  | "streetAddress"
  | "city"
  | "state"
  | "zipCode"
  | "caregiver1FirstName"
  | "caregiver1LastName"
  | "caregiver1Relationship"
  | "caregiver1Phone"
  | "caregiver1Email"
  | "caregiver2FirstName"
  | "caregiver2LastName"
  | "caregiver2Relationship"
  | "caregiver2Phone"
  | "caregiver2Email"
  | "pcpName"
  | "pcpClinicName"
  | "pcpPhone"
  | "isVisionTested"
  | "visionTestedDetails"
  | "isHearingTested"
  | "hasMedicalHistory"
  | "medicalHistoryExplanation"
  | "preschoolNameLocation"
  | "devPointToShow"
  | "devPointToShowComments"
  | "interviewDate"
  | "nonverbalBehaviorsCurrentScore"
  | "nonverbalBehaviorsPastScore"
  | "peerRelationshipsCurrentScore"
  | "peerRelationshipsPastScore"
  | "childName"
  | "caregiverName"
  | "assessmentDate"
  | "sensorySeekingScore"
  | "sensorySensitivityScore"
  | "adolescentName"
  | "adolescentDateOfBirth"
  | "evaluationDate"
  | "lowRegistrationScore"
  | "sensationAvoidingScore"
  | "studentName"
  | "teacherName"
  | "gradeClass"
  | "classroomSensoryScore"
  | "previewDate"
  | "hasHyperventilationHistory"
  | "languageLossStatus"
  | "patientFullName";

export interface FieldMapping {
  hippatizFieldId: string;
  fieldLabel: string;
  fieldType:
    | "text"
    | "email"
    | "phone"
    | "date"
    | "checkbox"
    | "radio"
    | "signature"
    | "textarea"
    | "number";
  patientField: PatientFieldName;
  required?: boolean;
  transform?: (value: any) => any; // Optional transformation function
}

/**
 * NEW PATIENT PRE-REGISTRATION FORM
 * Form ID: aa70234d-8dc6-4a9b-88e7-211289c891a0 (example from CSV)
 */
// Field IDs now match the exact label keys HIPPAtizer sends in the webhook payload
export const newPatientPreRegistrationMapping: FieldMapping[] = [
  {
    hippatizFieldId: "First Name",
    fieldLabel: "First Name",
    fieldType: "text",
    patientField: "firstName",
    required: true,
  },
  {
    hippatizFieldId: "Last Name",
    fieldLabel: "Last Name",
    fieldType: "text",
    patientField: "lastName",
    required: true,
  },
  {
    hippatizFieldId: "Patient Date of Birth",
    fieldLabel: "Patient Date of Birth",
    fieldType: "date",
    patientField: "dateOfBirth",
    required: true,
    transform: (value) => {
      if (!value) return null;
      const [month, day, year] = value.split("/");
      return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
    },
  },
  {
    hippatizFieldId: "Where does your child reside?",
    fieldLabel: "Where does your child reside?",
    fieldType: "text",
    patientField: "streetAddress",
  },
  {
    hippatizFieldId: "City",
    fieldLabel: "City",
    fieldType: "text",
    patientField: "city",
  },
  {
    hippatizFieldId: "State / Province",
    fieldLabel: "State / Province",
    fieldType: "text",
    patientField: "state",
  },
  {
    hippatizFieldId: "Label",
    fieldLabel: "Label",
    fieldType: "text",
    patientField: "zipCode",
  },
  {
    hippatizFieldId: "Relationship to Patient",
    fieldLabel: "Relationship to Patient",
    fieldType: "text",
    patientField: "caregiver1Relationship",
  },
  {
    hippatizFieldId: "Parent/Caregiver #1 Phone Number",
    fieldLabel: "Parent/Caregiver #1 Phone Number",
    fieldType: "phone",
    patientField: "caregiver1Phone",
  },
  {
    hippatizFieldId: "Parent/Caregiver #1 Email Address",
    fieldLabel: "Parent/Caregiver #1 Email Address",
    fieldType: "email",
    patientField: "caregiver1Email",
  },
  {
    hippatizFieldId: " Parent/Caregiver #2 Phone Number",
    fieldLabel: "Parent/Caregiver #2 Phone Number",
    fieldType: "phone",
    patientField: "caregiver2Phone",
  },
  {
    hippatizFieldId: "Parent/Caregiver #2 Email Address",
    fieldLabel: "Parent/Caregiver #2 Email Address",
    fieldType: "email",
    patientField: "caregiver2Email",
  },
  {
    hippatizFieldId: "Previous Pediatrician or Clinic Name",
    fieldLabel: "Previous Pediatrician or Clinic Name",
    fieldType: "text",
    patientField: "pcpClinicName",
  },
  {
    hippatizFieldId: "Phone Number",
    fieldLabel: "Phone Number",
    fieldType: "phone",
    patientField: "pcpPhone",
  },
];

/**
 * KiDS PATIENT INTAKE FORM
 */
export const kidsPatientIntakeFormMapping: FieldMapping[] = [
  {
    hippatizFieldId: "Child's First Name *",
    fieldLabel: "Child's First Name",
    fieldType: "text",
    patientField: "firstName",
    required: true,
  },
  {
    hippatizFieldId: "Child's Last Name *",
    fieldLabel: "Child's Last Name",
    fieldType: "text",
    patientField: "lastName",
    required: true,
  },
  {
    hippatizFieldId: "Date of Birth *",
    fieldLabel: "Date of Birth",
    fieldType: "date",
    patientField: "dateOfBirth",
    required: true,
    transform: (value) => {
      if (!value) return null;
      const [month, day, year] = (value as string).split("/");
      return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
    },
  },
  {
    hippatizFieldId: "Relationship to Child *",
    fieldLabel: "Relationship to Child (Primary Caregiver)",
    fieldType: "text",
    patientField: "caregiver1Relationship",
  },
  {
    hippatizFieldId: "Relationship to Child",
    fieldLabel: "Relationship to Child (Secondary Caregiver)",
    fieldType: "text",
    patientField: "caregiver2Relationship",
  },
  {
    hippatizFieldId: "Has your child had their VISION tested?",
    fieldLabel: "Has your child had their VISION tested?",
    fieldType: "checkbox",
    patientField: "isVisionTested",
    transform: (value) => value === "Yes" || value === true,
  },
  {
    hippatizFieldId: "If yes, specify where and when",
    fieldLabel: "If yes, specify where and when (Vision)",
    fieldType: "textarea",
    patientField: "visionTestedDetails",
  },
  {
    hippatizFieldId: "Has your child had their HEARING tested?",
    fieldLabel: "Has your child had their HEARING tested?",
    fieldType: "checkbox",
    patientField: "isHearingTested",
    transform: (value) => value === "Yes" || value === true,
  },
  {
    hippatizFieldId: "History of hospitalizations, surgeries, serious accidents, head injury, concussion, or serious/chronic illness?",
    fieldLabel: "History of hospitalizations, surgeries, or serious illness",
    fieldType: "checkbox",
    patientField: "hasMedicalHistory",
    transform: (value) => value === "Yes" || value === true,
  },
  {
    hippatizFieldId: "Name and location of Preschool or Head Start program",
    fieldLabel: "Name and location of Preschool or Head Start program",
    fieldType: "text",
    patientField: "preschoolNameLocation",
  },
  {
    hippatizFieldId: "Point to show something",
    fieldLabel: "Point to show something",
    fieldType: "radio",
    patientField: "devPointToShow",
  },
  {
    hippatizFieldId: "Comments (Point to show something)",
    fieldLabel: "Comments (Point to show something)",
    fieldType: "textarea",
    patientField: "devPointToShowComments",
  },
];

/**
 * DIAGNOSTIC INTERVIEW
 */
export const diagnosticInterviewMapping: FieldMapping[] = [
  {
    hippatizFieldId: "First",
    fieldLabel: "First",
    fieldType: "text",
    patientField: "firstName",
    required: true,
  },
  {
    hippatizFieldId: "Last",
    fieldLabel: "Last",
    fieldType: "text",
    patientField: "lastName",
    required: true,
  },
  {
    hippatizFieldId: "Date of Birth",
    fieldLabel: "Date of Birth",
    fieldType: "date",
    patientField: "dateOfBirth",
    transform: (value) => {
      if (!value) return null;
      const [month, day, year] = (value as string).split("/");
      return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
    },
  },
  {
    hippatizFieldId: "Date of Interview",
    fieldLabel: "Date of Interview",
    fieldType: "date",
    patientField: "interviewDate",
    transform: (value) => {
      if (!value) return null;
      const [month, day, year] = (value as string).split("/");
      return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
    },
  },
  {
    hippatizFieldId: "Name of Person Filling Out This Form",
    fieldLabel: "Name of Person Filling Out This Form",
    fieldType: "text",
    patientField: "caregiverName",
  },
  {
    hippatizFieldId: "Relationship to Patient",
    fieldLabel: "Relationship to Patient",
    fieldType: "text",
    patientField: "caregiver1Relationship",
  },
];

/**
 * SENSORY ASSESSMENT - PARENT/CAREGIVER
 */
// Field IDs match the exact label keys sent by the Parent/Caregiver sensory form
export const sensoryAssessmentParentMapping: FieldMapping[] = [
  {
    hippatizFieldId: "First Name",
    fieldLabel: "First Name",
    fieldType: "text",
    patientField: "firstName",
    required: true,
  },
  {
    hippatizFieldId: "Last Name",
    fieldLabel: "Last Name",
    fieldType: "text",
    patientField: "lastName",
    required: true,
  },
  {
    hippatizFieldId: "Date of Birth",
    fieldLabel: "Date of Birth",
    fieldType: "date",
    patientField: "dateOfBirth",
    required: true,
    transform: (value) => {
      if (!value) return null;
      const [month, day, year] = (value as string).split("/");
      return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
    },
  },
  {
    hippatizFieldId: "Who is filling out this form (First & Last Name)?",
    fieldLabel: "Who is filling out this form (First & Last Name)?",
    fieldType: "text",
    patientField: "caregiverName",
  },
  {
    hippatizFieldId: "What is your relationship to the child?",
    fieldLabel: "What is your relationship to the child?",
    fieldType: "text",
    patientField: "caregiver1Relationship",
  },
  {
    hippatizFieldId: "What grade is the child presently completing?",
    fieldLabel: "What grade is the child presently completing?",
    fieldType: "text",
    patientField: "gradeClass",
  },
  {
    hippatizFieldId: "Date Completed",
    fieldLabel: "Date Completed",
    fieldType: "date",
    patientField: "assessmentDate",
    transform: (value) => {
      if (!value) return null;
      const [month, day, year] = (value as string).split("/");
      return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
    },
  },
];

/**
 * SENSORY ASSESSMENT - ADOLESCENT
 */
export const sensoryAssessmentAdolescentMapping: FieldMapping[] = [
  {
    hippatizFieldId: "First Name",
    fieldLabel: "First Name",
    fieldType: "text",
    patientField: "firstName",
    required: true,
  },
  {
    hippatizFieldId: "Last Name",
    fieldLabel: "Last Name",
    fieldType: "text",
    patientField: "lastName",
    required: true,
  },
  {
    hippatizFieldId: "Date",
    fieldLabel: "Date",
    fieldType: "date",
    patientField: "assessmentDate",
    transform: (value) => {
      if (!value) return null;
      const [month, day, year] = (value as string).split("/");
      return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
    },
  },
  {
    hippatizFieldId: "Date Completed",
    fieldLabel: "Date Completed",
    fieldType: "date",
    patientField: "evaluationDate",
    transform: (value) => {
      if (!value) return null;
      const [month, day, year] = (value as string).split("/");
      return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
    },
  },
];

/**
 * SENSORY ASSESSMENT - TEACHER
 */
export const sensoryAssessmentTeacherMapping: FieldMapping[] = [
  {
    hippatizFieldId: "Student's name:",
    fieldLabel: "Student's name",
    fieldType: "text",
    patientField: "patientFullName",
  },
  {
    hippatizFieldId: "Date of birth:",
    fieldLabel: "Date of birth",
    fieldType: "date",
    patientField: "dateOfBirth",
    transform: (value) => {
      if (!value) return null;
      const [month, day, year] = (value as string).split("/");
      return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
    },
  },
  {
    hippatizFieldId: "Respondent(s):",
    fieldLabel: "Respondent(s)",
    fieldType: "text",
    patientField: "teacherName",
  },
  {
    hippatizFieldId: "Grade:",
    fieldLabel: "Grade",
    fieldType: "text",
    patientField: "gradeClass",
  },
  {
    hippatizFieldId: "Gender:",
    fieldLabel: "Gender",
    fieldType: "text",
    patientField: "gender",
  },
  {
    hippatizFieldId: "Date completed:",
    fieldLabel: "Date completed",
    fieldType: "date",
    patientField: "assessmentDate",
    transform: (value) => {
      if (!value) return null;
      const [month, day, year] = (value as string).split("/");
      return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
    },
  },
];

/**
 * PREVIEW INTERVIEW QUESTION
 */
export const previewInterviewMapping: FieldMapping[] = [
  {
    hippatizFieldId: "Patient Name:",
    fieldLabel: "Patient Name",
    fieldType: "text",
    patientField: "patientFullName",
  },
  {
    hippatizFieldId: "Date of Birth",
    fieldLabel: "Date of Birth",
    fieldType: "date",
    patientField: "dateOfBirth",
    transform: (value) => {
      if (!value) return null;
      const [month, day, year] = (value as string).split("/");
      return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
    },
  },
  {
    hippatizFieldId: "Date of Interview:",
    fieldLabel: "Date of Interview",
    fieldType: "date",
    patientField: "interviewDate",
    transform: (value) => {
      if (!value) return null;
      const [month, day, year] = (value as string).split("/");
      return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
    },
  },
  {
    hippatizFieldId: "Name of person filling out this form:",
    fieldLabel: "Name of person filling out this form",
    fieldType: "text",
    patientField: "caregiverName",
  },
  {
    hippatizFieldId: "Relationship to Patient:",
    fieldLabel: "Relationship to Patient",
    fieldType: "text",
    patientField: "caregiver1Relationship",
  },
];

/**
 * Master mapping by form title
 * Maps form titles to their field mappings
 */
export const formMappingsByTitle: Record<string, FieldMapping[]> = {
  "NEW PATIENT PRE-REGISTRATION": newPatientPreRegistrationMapping,
  "KiDS PATIENT INTAKE FORM": kidsPatientIntakeFormMapping,
  "DIAGNOSTIC INTERVIEW": diagnosticInterviewMapping,
  "SENSORY ASSESSMENT - PARENT/CAREGIVER": sensoryAssessmentParentMapping,
  "SENSORY ASSESSMENT - ADOLESCENT": sensoryAssessmentAdolescentMapping,
  "SENSORY ASSESSMENT - TEACHER": sensoryAssessmentTeacherMapping,
  "PREVIEW INTERVIEW QUESTION": previewInterviewMapping,
};

/**
 * Get mapping for a specific form
 */
export function getMappingForForm(formTitle: string): FieldMapping[] {
  const upper = formTitle.trim().toUpperCase();
  const key = Object.keys(formMappingsByTitle).find(k => k.toUpperCase() === upper);
  return key ? formMappingsByTitle[key] : [];
}

/**
 * Get all mapping field IDs (for validation)
 */
export function getAllMappedFieldIds(): Set<string> {
  const fieldIds = new Set<string>();
  Object.values(formMappingsByTitle).forEach((mappings) => {
    mappings.forEach((mapping) => {
      fieldIds.add(mapping.hippatizFieldId);
    });
  });
  return fieldIds;
}

/**
 * Critical matching fields (must be present in NEW PATIENT PRE-REGISTRATION)
 */
export const CRITICAL_MATCHING_FIELDS = [
  "First Name",
  "Last Name",
  "Patient Date of Birth",
];
