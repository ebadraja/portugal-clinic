"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Send, Loader2, Copy } from "lucide-react";

interface SamplePayloads {
  [key: string]: {
    event: string;
    hippatizer_form_id: string;
    form_title: string;
    submission_id: string;
    submitted_at: string;
    fields: Array<{
      field_id: string;
      label: string;
      type: string;
      value: string;
    }>;
  };
}

interface TestResult {
  success: boolean;
  message?: string;
  error?: string;
  result?: any;
  testMetadata?: {
    formType: string;
    testedAt: string;
    processedBy: string;
  };
}

export function WebhookTestingComponent() {
  const [samplePayloads, setSamplePayloads] = useState<SamplePayloads>({});
  const [selectedFormType, setSelectedFormType] = useState("");
  const [payload, setPayload] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Load sample payloads
  useEffect(() => {
    const loadSamples = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/webhooks/hippatizer/test");
        if (!response.ok) {
          throw new Error("Failed to load sample payloads");
        }
        const data = await response.json();
        setSamplePayloads(data.samplePayloads);

        // Set initial form type and payload
        const firstType = Object.keys(data.samplePayloads)[0];
        setSelectedFormType(firstType);
        setPayload(JSON.stringify(data.samplePayloads[firstType], null, 2));
      } catch (error) {
        console.error("Error loading samples:", error);
      } finally {
        setLoading(false);
      }
    };

    loadSamples();
  }, []);

  const handleFormTypeChange = (formType: string | null) => {
    if (!formType) return;
    setSelectedFormType(formType);
    if (samplePayloads[formType]) {
      setPayload(JSON.stringify(samplePayloads[formType], null, 2));
    }
    setResult(null);
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendTest = async () => {
    try {
      setSending(true);
      let testPayload;
      try {
        testPayload = JSON.parse(payload);
      } catch (e) {
        setResult({
          success: false,
          error: "Invalid JSON in payload",
        });
        setSending(false);
        return;
      }

      const response = await fetch("/api/webhooks/hippatizer/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testPayload,
          formType: selectedFormType,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Error sending test:", error);
      setResult({
        success: false,
        error: "Failed to send test webhook",
      });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
        <p className="text-gray-600">Loading sample payloads...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Webhook Testing</h2>
        <p className="text-sm text-gray-600 mt-1">
          Test your Hippatizer webhook integration with sample payloads
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Payload Editor */}
        <Card className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Select Form Type</label>
            <Select value={selectedFormType} onValueChange={handleFormTypeChange}>
              {Object.keys(samplePayloads).map((formType) => (
                <option key={formType} value={formType}>
                  {formType}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Payload</label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyPayload}
                className="gap-2"
              >
                <Copy className="w-4 h-4" />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              className="w-full h-64 p-3 border border-gray-300 rounded-lg font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Webhook payload JSON"
            />
          </div>

          <Button
            onClick={handleSendTest}
            disabled={sending || !payload}
            className="w-full bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Test Webhook
              </>
            )}
          </Button>
        </Card>

        {/* Right: Results */}
        <Card className="p-6 space-y-4 max-h-[600px] overflow-y-auto">
          <h3 className="font-semibold text-lg">Test Results</h3>

          {!result ? (
            <div className="text-center py-12 text-gray-500">
              <p>Send a test webhook to see results</p>
            </div>
          ) : result.success ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-green-900">{result.message}</p>
                  <p className="text-xs text-green-700 mt-1">
                    ✓ Webhook processed successfully
                  </p>
                </div>
              </div>

              {result.testMetadata && (
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Test Metadata</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-600">Form Type</p>
                      <p className="font-medium text-sm">{result.testMetadata.formType}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Processed By</p>
                      <p className="font-medium text-sm">{result.testMetadata.processedBy}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-600">Time</p>
                      <p className="font-medium text-sm">
                        {new Date(result.testMetadata.testedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {result.result && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                    Processing Details
                  </p>
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(result.result, null, 2)}
                  </pre>
                </div>
              )}

              <Badge className="bg-green-100 text-green-800 w-fit">Test Successful</Badge>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-900">Test Failed</p>
                  <p className="text-sm text-red-800 mt-1">{result.error || result.message}</p>
                </div>
              </div>

              <Badge className="bg-red-100 text-red-800 w-fit">Test Failed</Badge>
            </div>
          )}
        </Card>
      </div>

      {/* Instructions */}
      <Card className="p-6 bg-blue-50 border border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-4">How to Use</h3>
        <ol className="space-y-2 text-sm text-blue-800">
          <li className="flex gap-3">
            <span className="font-bold">1.</span>
            <span>Select a form type from the dropdown (Well Child Visit, Sick Visit, etc.)</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold">2.</span>
            <span>Review the sample payload and modify it if needed (patient name, dates, etc.)</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold">3.</span>
            <span>Click "Send Test Webhook" to simulate a real form submission</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold">4.</span>
            <span>Check the results panel to see if the form was processed and matched</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold">5.</span>
            <span>Verify the intake form appears in your Intake Forms list</span>
          </li>
        </ol>
      </Card>
    </div>
  );
}
