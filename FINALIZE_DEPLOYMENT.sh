#!/bin/bash
# GX Protocol Backend - Final Deployment Steps
# Run this script after v2.0.6 image distribution completes

set -e

echo "=== GX Protocol Backend - Final Deployment ==="
echo ""

# Step 1: Verify v2.0.6 images are available on all nodes
echo "Step 1: Checking v2.0.6 images on nodes..."
echo ""
echo "Local node (srv1089618):"
sudo /usr/local/bin/k3s ctr images ls | grep "gx-protocol" | grep "2.0.6" | wc -l
echo ""

# Step 2: Delete pods waiting for images
echo "Step 2: Deleting pods waiting for v2.0.6 images..."
echo ""

kubectl delete pod -n backend-mainnet -l app=svc-tax 2>/dev/null || echo "No svc-tax pods to delete"
kubectl delete pod -n backend-mainnet -l app=svc-tokenomics 2>/dev/null || echo "No svc-tokenomics pods to delete"
kubectl delete pod -n backend-mainnet -l app=svc-organization 2>/dev/null || echo "No svc-organization pods to delete"
kubectl delete pod -n backend-mainnet -l app=outbox-submitter 2>/dev/null || echo "No outbox-submitter pods to delete"
kubectl delete pod -n backend-mainnet -l app=projector 2>/dev/null || echo "No projector pods to delete"

# Also delete any ImagePullBackOff or CrashLoopBackOff pods
kubectl get pods -n backend-mainnet | grep ImagePullBackOff | awk '{print $1}' | xargs -r kubectl delete pod -n backend-mainnet 2>/dev/null || echo "No ImagePullBackOff pods"
kubectl get pods -n backend-mainnet | grep CrashLoopBackOff | awk '{print $1}' | xargs -r kubectl delete pod -n backend-mainnet 2>/dev/null || echo "No CrashLoopBackOff pods"

echo ""
echo "Waiting 30 seconds for pods to recreate..."
sleep 30

# Step 3: Check deployment status
echo ""
echo "Step 3: Checking deployment status..."
echo ""
kubectl get deployment -n backend-mainnet | grep -E "NAME|svc-|outbox|projector"

# Step 4: Check pod status
echo ""
echo "Step 4: Checking pod status..."
echo ""
kubectl get pods -n backend-mainnet | grep -E "NAME|svc-|outbox|projector"

# Step 5: Wait for all pods to be ready
echo ""
echo "Step 5: Waiting for all pods to be ready (timeout 5 minutes)..."
echo ""

TIMEOUT=300
ELAPSED=0
INTERVAL=10

while [ $ELAPSED -lt $TIMEOUT ]; do
  READY=$(kubectl get pods -n backend-mainnet | grep -E "svc-|outbox|projector" | grep "Running" | grep "1/1" | wc -l)
  TOTAL=$(kubectl get deployment -n backend-mainnet | grep -E "svc-|outbox|projector" | awk '{sum += $2} END {print sum}')

  echo "[$ELAPSED s] Ready: $READY / Expected: $TOTAL"

  if [ "$READY" -eq "$TOTAL" ]; then
    echo ""
    echo "✅ All pods are ready!"
    break
  fi

  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  echo ""
  echo "⚠️  Timeout waiting for pods. Check manually:"
  echo "kubectl get pods -n backend-mainnet | grep -E 'svc-|outbox|projector'"
fi

# Step 6: Test health endpoints
echo ""
echo "Step 6: Testing health endpoints..."
echo ""

echo "svc-identity:"
kubectl exec -n backend-mainnet -l app=svc-identity -- curl -s http://localhost:3001/health | head -c 100
echo ""

echo "svc-admin:"
kubectl exec -n backend-mainnet -l app=svc-admin -- curl -s http://localhost:3002/health | head -c 100
echo ""

# Step 7: Summary
echo ""
echo "=== Deployment Summary ==="
echo ""
kubectl get pods -n backend-mainnet -o wide | grep -E "NAME|svc-|outbox|projector"
echo ""

echo "=== Next Steps ==="
echo ""
echo "1. Check logs of any failing pods:"
echo "   kubectl logs -n backend-mainnet <pod-name> --tail=50"
echo ""
echo "2. Test API endpoints in Postman:"
echo "   - svc-identity: http://<node-ip>:3001/health"
echo "   - svc-admin: http://<node-ip>:3002/health"
echo "   - svc-tokenomics: http://<node-ip>:3003/health"
echo ""
echo "3. View service logs:"
echo "   kubectl logs -n backend-mainnet -l app=svc-identity --tail=100 -f"
echo ""
echo "✅ Deployment script complete!"
