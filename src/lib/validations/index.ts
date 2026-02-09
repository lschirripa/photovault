import { MAX_FILE_SIZE, SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_VIDEO_EXTENSIONS } from "../constants";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateEmail(email: string): ValidationResult {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    return { valid: false, error: "Email is required" };
  }
  if (!emailRegex.test(email)) {
    return { valid: false, error: "Invalid email format" };
  }
  return { valid: true };
}

export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { valid: false, error: "Password is required" };
  }
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
  }
  return { valid: true };
}

export function validateDisplayName(name: string): ValidationResult {
  if (!name) {
    return { valid: false, error: "Display name is required" };
  }
  if (name.length < 2) {
    return { valid: false, error: "Display name must be at least 2 characters" };
  }
  if (name.length > 50) {
    return { valid: false, error: "Display name must be less than 50 characters" };
  }
  return { valid: true };
}

export function validateGroupName(name: string): ValidationResult {
  if (!name) {
    return { valid: false, error: "Group name is required" };
  }
  if (name.length < 2) {
    return { valid: false, error: "Group name must be at least 2 characters" };
  }
  if (name.length > 100) {
    return { valid: false, error: "Group name must be less than 100 characters" };
  }
  return { valid: true };
}

export function validateFile(file: File): ValidationResult {
  const extension = "." + file.name.split(".").pop()?.toLowerCase();
  const supportedExtensions = [...SUPPORTED_IMAGE_EXTENSIONS, ...SUPPORTED_VIDEO_EXTENSIONS];

  if (!supportedExtensions.includes(extension as typeof supportedExtensions[number])) {
    return { valid: false, error: `Unsupported file type: ${extension}` };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: "File size exceeds 100MB limit" };
  }

  return { valid: true };
}
